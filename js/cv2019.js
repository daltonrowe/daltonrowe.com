/* ------------------------------------------------------------------------ */
/* Parallax BG */
/* ------------------------------------------------------------------------ */

function parallaxBg(id, scrollPosition, ratio) {
  var elem = document.getElementById(id);

  if (elem) {
    var dist = elem.getBoundingClientRect().top;
    var position = dist - scrollPosition;
    var parallaxPos = Math.floor(position * ratio);
    elem.style.backgroundPosition = "0px " + parallaxPos + "px";
  }
}

var ticking = false;
function addParallaxListeners() {
  window.addEventListener("scroll", function(e) {
    scrollPosition = window.scrollY;

    if (!ticking) {
      window.requestAnimationFrame(function() {
        parallaxBg("bg1", scrollPosition, -0.2);
        parallaxBg("bg2", scrollPosition, 0.1);
        parallaxBg("bg3", scrollPosition, -0.4);
        ticking = false;
      });

      ticking = true;
    }
  });
}

document.addEventListener("DOMContentLoaded", function(event) {
  addParallaxListeners();
});
