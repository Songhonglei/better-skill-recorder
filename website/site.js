const copy = document.querySelector('#copy-prompt');
const prompt = document.querySelector('#agent-prompt');
const status = document.querySelector('#copy-status');
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(prompt.value);
    status.textContent = copy.dataset.copied;
  } catch {
    prompt.focus();
    prompt.select();
    status.textContent = copy.dataset.error;
  }
});
// Links also work without JavaScript; preserve the section when switching.
const language = document.querySelector('.language');
language.addEventListener('click', () => {
  const target = new URL(language.href);
  target.hash = location.hash;
  language.href = target.href;
});
