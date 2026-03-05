// Mock Ontraport merge field values for local development.
// In production, these are set by Ontraport's server-side rendering
// before the page reaches the browser.

window.__ONTRAPORT_MOCK__ = true;

// Simulates [Visitor//Contact ID]
window.__MOCK_CONTACT_ID__ = '12345';

// Simulates a VitalSync API key (replace with a real dev key if available)
window.__MOCK_API_KEY__ = '';

// Add more mock values as needed for your project.
// These correspond to the merge fields used in html/header.html.
