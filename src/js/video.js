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

  function getAuthHeaders() {
    var token = window.ClinicianAuth ? window.ClinicianAuth.getToken() : null;
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? 'Bearer ' + token : '',
    };
  }

  // ── API calls ──

  function startVideoRoom(appointmentId, doctorName) {
    return fetch(API_BASE + '/api/video/room', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ appointmentId: String(appointmentId), doctorName: doctorName }),
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

    // Auto-scroll to bottom
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

    var container = document.getElementById('video-container');
    if (!container) return null;

    var frame = window.DailyIframe.createFrame(container, {
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
    });

    // ── Event handlers ──

    frame.on('joined-meeting', function () {
      updateStatusBadge('Live', 'live');
      if (window.AppUtils) window.AppUtils.showToast('Video consultation started — waiting for patient to join', 'success');
      // Auto-start transcription with Australian English + speaker diarization
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
      console.log('Transcription event keys:', Object.keys(event));
      console.log('Transcription event:', JSON.stringify(event, null, 2));
      // Try all possible speaker identification fields
      var speaker = event.user_name || event.userName || 'Unknown';
      if (speaker === 'Unknown') {
        var sid = event.session_id || event.sessionId || event.participantId;
        if (sid && frame) {
          var participants = frame.participants();
          // Check local participant first
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

  function joinCall(roomUrl, token) {
    var callArea = document.getElementById('video-call-area');
    if (callArea) callArea.classList.remove('hidden');

    // Show end button, hide start button
    var startBtn = document.getElementById('btn-start-video');
    var endBtn = document.getElementById('btn-end-video');
    if (startBtn) startBtn.classList.add('hidden');
    if (endBtn) endBtn.classList.remove('hidden');

    updateStatusBadge('Connecting...', 'connecting');
    clearTranscript();

    callFrame = createCallFrame();
    if (!callFrame) {
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Failed to load video SDK', 'error');
      return;
    }

    callFrame.join({ url: roomUrl, token: token }).catch(function (err) {
      console.error('Failed to join call:', err);
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Failed to join video call: ' + err.message, 'error');
    });
  }

  function leaveCall() {
    if (callFrame) {
      try { callFrame.leave(); } catch (e) { /* ignore */ }
      try { callFrame.destroy(); } catch (e) { /* ignore */ }
      callFrame = null;
    }

    var callArea = document.getElementById('video-call-area');
    if (callArea) callArea.classList.add('hidden');

    // Show start button, hide end button
    var startBtn = document.getElementById('btn-start-video');
    var endBtn = document.getElementById('btn-end-video');
    if (startBtn) startBtn.classList.remove('hidden');
    if (endBtn) endBtn.classList.add('hidden');

    videoExpanded = false;
    var container = document.getElementById('video-call-area');
    if (container) container.classList.remove('video-expanded');
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
    leaveCall();
    clearTranscript();
    showVideoSection();
    updateStatusBadge('Ready', 'ready');

    // Check if a room already exists (e.g. returning to workspace)
    checkVideoStatus(appointmentId).then(function (status) {
      if (status.roomReady && status.participants > 0) {
        updateStatusBadge(status.participants + ' in call', 'live');
      }
    });
  }

  function startCall(appointmentId, doctorName) {
    if (!appointmentId) return;
    updateStatusBadge('Creating room...', 'connecting');

    startVideoRoom(appointmentId, doctorName).then(function (data) {
      activeCall = {
        appointmentId: appointmentId,
        roomUrl: data.roomUrl,
        roomName: data.roomName,
        token: data.token,
      };
      joinCall(data.roomUrl, data.token);
    }).catch(function (err) {
      console.error('Failed to start video:', err);
      updateStatusBadge('Error', 'error');
      if (window.AppUtils) window.AppUtils.showToast('Failed to start video: ' + err.message, 'error');
    });
  }

  function endCall() {
    if (!activeCall) {
      leaveCall();
      return;
    }

    var appointmentId = activeCall.appointmentId;
    leaveCall();
    updateStatusBadge('Ending...', 'connecting');

    endVideoRoom(appointmentId).then(function (result) {
      activeCall = null;
      updateStatusBadge('Ended', 'ended');

      // If we got a transcript back, keep it displayed
      if (result.transcript && result.transcript.length > 0) {
        clearTranscript();
        result.transcript.forEach(function (entry) {
          appendTranscriptEntry(entry.speaker, entry.text);
        });
        // Show the transcript panel even though the call area is hidden
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
      activeCall = null;
      updateStatusBadge('Ended', 'ended');
    });
  }

  function cleanup() {
    leaveCall();
    hideVideoSection();
    clearTranscript();
    activeCall = null;
  }

  function getTranscriptText() {
    // Return the accumulated transcript as plain text (for pasting into clinical notes)
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
    toggleSize: toggleVideoSize,
    isActive: function () { return !!activeCall; },
    getTranscriptText: getTranscriptText,
  };
})();
