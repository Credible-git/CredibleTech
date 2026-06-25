// Mobile nav toggle.
// Grabs the button and the nav list, and flips a class on click.
// This is the only JS on the whole site — everything else is HTML/CSS.

const toggleBtn = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (toggleBtn && navLinks) {
  toggleBtn.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });
}
