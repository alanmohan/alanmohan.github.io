// Updated to the live Render URL after deployment.
const API_URL = 'http://127.0.0.1:5000/api/chat';
const tripForm = document.querySelector('#trip-form');
const followupForm = document.querySelector('#followup-form');
const messages = document.querySelector('#messages');
const status = document.querySelector('#status');
const resetButton = document.querySelector('#reset-button');
const submitButton = document.querySelector('#submit-button');
const followupButton = document.querySelector('#followup-button');
const history = [];
let busy = false;

function selectedInterests() {
  return [...document.querySelectorAll('input[name="interest"]:checked')].map(input => input.value);
}

function addMessage(role, content) {
  const welcome = messages.querySelector('.welcome');
  if (welcome) welcome.remove();
  const node = document.createElement('div');
  node.className = `message message--${role}`;
  node.textContent = role === 'assistant' ? content.replace(/\*\*/g, '') : content;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function setBusy(value, text = '') {
  busy = value;
  submitButton.disabled = value;
  followupButton.disabled = value;
  status.classList.remove('error');
  status.textContent = text;
}

async function ask(question) {
  if (busy) return;
  const interests = selectedInterests();
  if (!interests.length) {
    status.classList.add('error');
    status.textContent = 'Choose at least one interest.';
    return;
  }
  if (interests.length > 6) {
    status.classList.add('error');
    status.textContent = 'Choose up to six interests.';
    return;
  }
  const payload = {
    budget: Number(document.querySelector('#budget').value),
    trip_length_days: Number(document.querySelector('#days').value),
    interests,
    travel_party: document.querySelector('#party').value,
    question: question.trim(),
    conversation: history.slice(-8),
  };
  const pendingMessage = addMessage('user', payload.question);
  setBusy(true, 'Finding ideas for your trip… A sleeping service may take a minute to wake.');
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || `Request failed (${response.status}).`);
    if (!data.answer) throw new Error('No recommendation was returned. Please try again.');
    addMessage('assistant', data.answer);
    history.push({ role: 'user', content: payload.question }, { role: 'assistant', content: data.answer });
    if (history.length > 8) history.splice(0, history.length - 8);
    followupForm.hidden = false;
    resetButton.hidden = false;
    setBusy(false, 'Recommendations for inspiration. Verify details before booking.');
    return true;
  } catch (error) {
    pendingMessage.remove();
    setBusy(false);
    status.classList.add('error');
    status.textContent = `${error.message} Your question is still here; please try again.`;
    return false;
  }
}

tripForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!tripForm.reportValidity()) return;
  ask(document.querySelector('#question').value);
});

followupForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!followupForm.reportValidity()) return;
  const field = document.querySelector('#followup');
  const question = field.value;
  if (await ask(question)) field.value = '';
});

resetButton.addEventListener('click', () => {
  if (busy) return;
  history.length = 0;
  messages.innerHTML = '<div class="welcome"><div class="welcome-icon" aria-hidden="true">✳</div><h3>Let’s find somewhere wonderful.</h3><p>Fill in your trip details and ask your first question. Your recommendations will appear here.</p></div>';
  followupForm.hidden = true;
  resetButton.hidden = true;
  document.querySelector('#question').value = '';
  document.querySelector('#followup').value = '';
  status.textContent = '';
  status.classList.remove('error');
});
