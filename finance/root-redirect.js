// Sends the bare origin to the public site. Kept in a file (not an inline
// `<script>`) so the root document can carry a strict CSP that forbids inline
// JavaScript.
window.location.replace('/finance/site/');
