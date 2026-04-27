// thc-clinicians-portal — Video Consultation Module
// Uses Daily.co JS SDK for video calls with live Deepgram transcription.
// Loads after auth.js, before app.js. Requires @daily-co/daily-js CDN.
(function () {
  'use strict';

  var API_BASE = window.ClinicianAuth ? window.ClinicianAuth.API_BASE : '';
  var callFrame = null;       // Daily call object
  var activeCall = null;      // { appointmentId, roomUrl, roomName, token }
  var videoExpanded = false;
  var transcriptEntries = []; // Live transcript accumulator
  var callStartTime = null;   // Date when joined-meeting fired
  var activePatientName = ''; // Patient name for the indicator
  var activePatientId = null; // Patient contact ID

  function getAuthHeaders() {
    var token = window.ClinicianAuth ? window.ClinicianAuth.getToken() : null;
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? 'Bearer ' + token : '',
    };
  }

  // ── API calls ──

  function startVideoRoom(appointmentId, doctorName, patientId) {
    return fetch(API_BASE + '/api/video/room', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ appointmentId: String(appointmentId), doctorName: doctorName, patientId: patientId ? String(patientId) : undefined }),
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Failed to start video'); });
      return res.json();
    });
  }

  function checkVideoStatus(appointmentId) {
    return fetch(API_BASE + '/api/video/status/' + appointmentId, {
      headers: getAuthHeaders(),
    }).then(function (res) {
      if (!res.ok) return { roomReady: false, participants: 0 };
      return res.json();
    });
  }

  function endVideoRoom(appointmentId) {
    return fetch(API_BASE + '/api/video/end/' + appointmentId, {
      method: 'POST',
      headers: getAuthHeaders(),
    }).then(function (res) {
      return res.json();
    });
  }

  // ── UI management ──

  function showVideoSection() {
    var section = document.getElementById('workspace-video-section');
    if (section) section.classList.remove('hidden');
  }

  function hideVideoSection() {
    var section = document.getElementById('workspace-video-section');
    if (section) section.classList.add('hidden');
  }

  function updateStatusBadge(text, type) {
    var badge = document.getElementById('video-status-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = 'video-bar-status';
    if (type) badge.classList.add('video-status-' + type);
  }

  function updateBarLabel(text) {
    var label = document.getElementById('video-bar-label');
    if (label) label.textContent = text;
  }

  function updateTranscriptIndicator(active) {
    var indicator = document.getElementById('transcript-indicator');
    if (!indicator) return;
    if (active) {
      indicator.textContent = 'Transcribing';
      indicator.className = 'transcript-indicator transcript-active';
    } else {
      indicator.textContent = '';
      indicator.className = 'transcript-indicator';
    }
  }

  function appendTranscriptEntry(speaker, text) {
    var content = document.getElementById('transcript-content');
    if (!content) return;

    transcriptEntries.push({ speaker: speaker, text: text, time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });

    var entry = document.createElement('div');
    entry.className = 'transcript-entry';
    entry.innerHTML =
      '<span class="transcript-speaker">' + escapeHtml(speaker) + '</span>' +
      '<span class="transcript-text">' + escapeHtml(text) + '</span>';
    content.appendChild(entry);

    content.scrollTop = content.scrollHeight;
  }

  function clearTranscript() {
    var content = document.getElementById('transcript-content');
    if (content) content.innerHTML = '';
    transcriptEntries = [];
    updateTranscriptIndicator(false);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Daily JS SDK call management ──

  function createCallFrame() {
    if (!window.DailyIframe) {
      console.error('Daily JS SDK not loaded');
      return null;
    }

    var audioOnly = !!(activeCall && activeCall.audioOnly);
    var frame;

    if (audioOnly) {
      // Headless call object — no iframe, no Daily prebuilt UI. The browser
      // shows its native mic-permission prompt directly; on accept,
      // joined-meeting fires and transcription starts. We deliberately do
      // NOT use createFrame() in audio-only mode because our CSS hides the
      // video tile (which is also where Daily's prebuilt "Join" button
      // lives) — the doctor would have nothing to click and the call would
      // hang forever on "Starting recording...".
      frame = window.DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      });
    } else {
      var container = document.getElementById('video-container');
      if (!container) return null;
      var frameOpts = {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px',
        },
        showLeaveButton: false,
        showFullscreenButton: true,
        theme: {
          colors: {
            accent: '#20c0c0',
            accentText: '#ffffff',
            background: '#f7fafa',
            backgroundAccent: '#e0f7f7',
            baseText: '#1a1a2e',
            border: '#e2e8f0',
            mainAreaBg: '#1a1a2e',
            mainAreaBgAccent: '#20c0c0',
            mainAreaText: '#ffffff',
            supportiveText: '#718096',
          },
        },
      };
      frame = window.DailyIframe.createFrame(container, frameOpts);
    }

    // ── Event handlers ──

    frame.on('joined-meeting', function () {
      callStartTime = new Date();
      var audioOnly = !!(activeCall && activeCall.audioOnly);
      updateStatusBadge(audioOnly ? 'Recording' : 'Live', 'live');
      if (window.AppUtils) {
        window.AppUtils.showToast(
          audioOnly
            ? 'Audio recording started — transcribing the room'
            : 'Video consultation started — waiting for patient to join',
          'success'
        );
      }
      try {
        frame.startTranscription({
          extra: {
            language: 'en-AU',
            punctuate: true,
            diarize: true,
            smart_format: true,
            utterances: true,
          },
        });
      } catch (e) {
        console.warn('Could not auto-start transcription:', e);
      }
    });

    frame.on('left-meeting', function () {
      updateStatusBadge('Disconnected', 'ended');
      // Notify app.js that the call ended (e.g. network drop, patient ended)
      if (window._onVideoCallEnded) window._onVideoCallEnded();
    });

    frame.on('participant-joined', function (event) {
      var name = event.participant.user_name || 'Participant';
      if (!event.participant.local) {
        if (window.AppUtils) window.AppUtils.showToast(name + ' joined the consultation', 'info');
      }
    });

    frame.on('participant-left', function (event) {
      var name = event.participant.user_name || 'Participant';
      if (!event.participant.local) {
        if (window.AppUtils) window.AppUtils.showToast(name + ' left the consultation', 'info');
      }
    });

    frame.on('transcription-started', function () {
      updateTranscriptIndicator(true);
    });

    frame.on('transcription-stopped', function () {
      updateTranscriptIndicator(false);
    });

    frame.on('transcription-message', function (event) {
      if (!event.text) return;
      var speaker = event.user_name || event.userName || 'Unknown';
      if (speaker === 'Unknown') {
        var sid = event.session_id || event.sessionId || event.participantId;
        if (sid && frame) {
          var participants = frame.participants();
          if (participants.local && participants.local.session_id === sid) {
            speaker = participants.local.user_name || 'You';
          } else {
            for (var key in participants) {
              if (participants[key].session_id === sid) {
                speaker = participants[key].user_name || 'Participant';
                break;
              }
            }
          }
        }
      }
      appendTranscriptEntry(speaker, event.text);
    });

    frame.on('error', function (event) {
      console.error('Daily error:', event);
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Video error: ' + (event.errorMsg || 'Unknown error'), 'error');
    });

    return frame;
  }

  function joinCall(roomUrl, token, audioOnly) {
    var callArea = document.getElementById('video-call-area');
    if (callArea) {
      callArea.classList.remove('hidden');
      // audio-only-mode hides the dark video tile and lets the transcript
      // panel take the full width so the doctor sees only what matters
      // during an in-person consult: the live transcript.
      callArea.classList.toggle('audio-only-mode', !!audioOnly);
    }

    var startVideoBtn = document.getElementById('btn-start-video');
    var startAudioBtn = document.getElementById('btn-start-audio');
    var endBtn = document.getElementById('btn-end-video');
    var expandBtn = document.getElementById('btn-toggle-video-size');
    if (startVideoBtn) startVideoBtn.classList.add('hidden');
    if (startAudioBtn) startAudioBtn.classList.add('hidden');
    if (endBtn) {
      endBtn.classList.remove('hidden');
      endBtn.textContent = audioOnly ? 'Stop Recording' : 'End Call';
    }
    // No video tile in audio-only mode → expand button is meaningless. Hide it
    // so doctors don't click it expecting something to happen.
    if (expandBtn) expandBtn.classList.toggle('hidden', !!audioOnly);

    updateBarLabel(audioOnly ? 'Audio Transcription' : 'Video Consultation');
    updateStatusBadge(audioOnly ? 'Starting recording...' : 'Connecting...', 'connecting');
    clearTranscript();

    callFrame = createCallFrame();
    if (!callFrame) {
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Failed to load video SDK', 'error');
      return;
    }

    var joinOpts = { url: roomUrl, token: token };

    callFrame.join(joinOpts).catch(function (err) {
      console.error('Failed to join call:', err);
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Failed to start ' + (audioOnly ? 'recording' : 'video call') + ': ' + err.message, 'error');
    });
  }

  function leaveCall() {
    if (callFrame) {
      try { callFrame.leave(); } catch (e) { /* ignore */ }
      try { callFrame.destroy(); } catch (e) { /* ignore */ }
      callFrame = null;
    }

    var callArea = document.getElementById('video-call-area');
    if (callArea) {
      callArea.classList.add('hidden');
      callArea.classList.remove('video-ended-transcript-only');
      callArea.classList.remove('audio-only-mode');
    }

    var startVideoBtn = document.getElementById('btn-start-video');
    var startAudioBtn = document.getElementById('btn-start-audio');
    var endBtn = document.getElementById('btn-end-video');
    var expandBtn = document.getElementById('btn-toggle-video-size');
    if (startVideoBtn) startVideoBtn.classList.remove('hidden');
    if (startAudioBtn) startAudioBtn.classList.remove('hidden');
    if (expandBtn) expandBtn.classList.remove('hidden');
    if (endBtn) {
      endBtn.classList.add('hidden');
      endBtn.textContent = 'End Call';
    }
    updateBarLabel('Video Consultation');

    videoExpanded = false;
    if (callArea) callArea.classList.remove('video-expanded');
  }

  function toggleVideoSize() {
    var container = document.getElementById('video-call-area');
    if (!container) return;
    videoExpanded = !videoExpanded;
    container.classList.toggle('video-expanded', videoExpanded);
  }

  // ── Public API ──

  function initForAppointment(appointmentId) {
    activeCall = null;
    callStartTime = null;
    activePatientName = '';
    activePatientId = null;
    leaveCall();
    clearTranscript();
    showVideoSection();
    updateStatusBadge('Ready', 'ready');

    checkVideoStatus(appointmentId).then(function (status) {
      if (status.roomReady && status.participants > 0) {
        updateStatusBadge(status.participants + ' in call', 'live');
      }
    });
  }

  function startCall(appointmentId, doctorName, patientId, patientName, opts) {
    if (!appointmentId) return;
    var audioOnly = !!(opts && opts.audioOnly);
    activePatientName = patientName || '';
    activePatientId = patientId || null;
    updateStatusBadge(audioOnly ? 'Preparing recording...' : 'Creating room...', 'connecting');

    startVideoRoom(appointmentId, doctorName, patientId).then(function (data) {
      activeCall = {
        appointmentId: appointmentId,
        roomUrl: data.roomUrl,
        roomName: data.roomName,
        token: data.token,
        audioOnly: audioOnly,
      };
      joinCall(data.roomUrl, data.token, audioOnly);
    }).catch(function (err) {
      console.error('Failed to start ' + (audioOnly ? 'audio recording' : 'video') + ':', err);
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Failed to start ' + (audioOnly ? 'audio recording' : 'video') + ': ' + err.message, 'error');
    });
  }

  function endCall() {
    if (!activeCall) {
      leaveCall();
      return;
    }

    var appointmentId = activeCall.appointmentId;
    leaveCall();
    activeCall = null;
    callStartTime = null;
    updateStatusBadge('Ending...', 'connecting');

    endVideoRoom(appointmentId).then(function (result) {
      updateStatusBadge('Ended', 'ended');

      if (result.transcript && result.transcript.length > 0) {
        clearTranscript();
        result.transcript.forEach(function (entry) {
          appendTranscriptEntry(entry.speaker, entry.text);
        });
        var callArea = document.getElementById('video-call-area');
        if (callArea) {
          callArea.classList.remove('hidden');
          callArea.classList.add('video-ended-transcript-only');
        }
        if (window.AppUtils) window.AppUtils.showToast('Consultation ended — transcript available below', 'success');
      } else {
        if (window.AppUtils) window.AppUtils.showToast('Video consultation ended', 'info');
      }
    }).catch(function (err) {
      console.error('Failed to end video room:', err);
      updateStatusBadge('Ended', 'ended');
    });
  }

  /** Full teardown — only called when explicitly ending or no active call. */
  function cleanup() {
    leaveCall();
    hideVideoSection();
    clearTranscript();
    activeCall = null;
    callStartTime = null;
    activePatientName = '';
    activePatientId = null;
  }

  /** Hide workspace video UI but keep the call alive. Call continues in the hidden DOM. */
  function detach() {
    hideVideoSection();
    // Don't destroy callFrame, don't clear activeCall — the Daily iframe stays in the DOM
  }

  /** Re-show workspace video UI after returning from another view. */
  function reattach() {
    showVideoSection();
    if (activeCall && callFrame) {
      var callArea = document.getElementById('video-call-area');
      if (callArea) callArea.classList.remove('hidden');

      var startBtn = document.getElementById('btn-start-video');
      var endBtn = document.getElementById('btn-end-video');
      if (startBtn) startBtn.classList.add('hidden');
      if (endBtn) endBtn.classList.remove('hidden');

      updateStatusBadge('Live', 'live');
    }
  }

  /** Get info about the active call (for the floating indicator). */
  function getActiveCallInfo() {
    if (!activeCall) return null;
    return {
      appointmentId: activeCall.appointmentId,
      patientName: activePatientName,
      patientId: activePatientId,
      startTime: callStartTime,
    };
  }

  function getTranscriptText() {
    return transcriptEntries.map(function (e) {
      return e.speaker + ': ' + e.text;
    }).join('\n');
  }

  // ── Expose on window ──

  window.VideoConsultation = {
    initForAppointment: initForAppointment,
    startCall: startCall,
    endCall: endCall,
    cleanup: cleanup,
    detach: detach,
    reattach: reattach,
    getActiveCallInfo: getActiveCallInfo,
    toggleSize: toggleVideoSize,
    isActive: function () { return !!activeCall; },
    getTranscriptText: getTranscriptText,
  };
})();
