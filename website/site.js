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

const carousel = document.querySelector('.hero-carousel');
const slides = [...carousel.querySelectorAll('[data-slide]')];
const dots = [...carousel.querySelectorAll('[data-go]')];
const toggle = carousel.querySelector('.carousel-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current = 0;
let paused = reducedMotion.matches;
let hovered = false;
let focused = false;
let timer;
function showSlide(index) {
  current = index;
  slides.forEach((slide, i) => {
    slide.setAttribute('aria-hidden', String(i !== index));
    slide.inert = i !== index;
  });
  dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  carousel.dataset.active = String(index);
}
function scheduleSlide() {
  clearTimeout(timer);
  toggle.textContent = paused ? toggle.dataset.play : toggle.dataset.pause;
  if (!paused && !hovered && !focused && !document.hidden) {
    timer = setTimeout(() => { showSlide((current + 1) % slides.length); scheduleSlide(); }, 2500);
  }
}
carousel.addEventListener('mouseenter', () => { hovered = true; scheduleSlide(); });
carousel.addEventListener('mouseleave', () => { hovered = false; scheduleSlide(); });
carousel.addEventListener('focusin', () => { focused = true; scheduleSlide(); });
carousel.addEventListener('focusout', () => {
  queueMicrotask(() => { focused = carousel.contains(document.activeElement); scheduleSlide(); });
});
toggle.addEventListener('click', () => { paused = !paused; scheduleSlide(); });
dots.forEach((dot, i) => dot.addEventListener('click', () => { showSlide(i); scheduleSlide(); }));
document.addEventListener('visibilitychange', scheduleSlide);
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; scheduleSlide(); });
showSlide(0);
scheduleSlide();
