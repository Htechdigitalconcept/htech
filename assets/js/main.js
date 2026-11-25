(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  var panel = document.getElementById('nav-panel');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function updateHeader() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  }

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  function setMenu(open) {
    if (!toggle || !panel) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  }

  if (toggle && panel) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });

    panel.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setMenu(false);
    });
  }

  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    reveals.forEach(function (el) { observer.observe(el); });
  }

  var galleries = Array.prototype.slice.call(document.querySelectorAll('[data-gallery]'));
  galleries.forEach(function (gallery) {
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('.gallery-thumb'));
    var stageImage = gallery.querySelector('[data-gallery-image]');
    var stageCaption = gallery.querySelector('[data-gallery-caption]');
    var stageCounter = gallery.querySelector('[data-gallery-counter]');
    var thumbStrip = gallery.querySelector('.gallery-thumbs');
    var lightbox = gallery.querySelector('.lightbox');
    var lightboxImage = lightbox.querySelector('[data-lightbox-image]');
    var lightboxCaption = lightbox.querySelector('[data-lightbox-caption]');
    var lightboxCounter = lightbox.querySelector('[data-lightbox-counter]');
    var stage = gallery.querySelector('[data-gallery-stage]');
    var current = 0;
    var lastFocus = null;

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function imageData(index) {
      var thumb = thumbs[index];
      var thumbImage = thumb.querySelector('img');
      return {
        src: thumb.getAttribute('data-full') || thumbImage.getAttribute('src'),
        alt: thumbImage.getAttribute('alt') || '',
        caption: thumb.getAttribute('data-caption') || ''
      };
    }

    function updateLightbox() {
      var data = imageData(current);
      lightboxImage.src = data.src;
      lightboxImage.alt = data.alt;
      lightboxCaption.textContent = data.caption;
      lightboxCounter.textContent = pad(current + 1) + ' / ' + pad(thumbs.length);
    }

    function render(index, scrollThumb) {
      if (!thumbs.length) return;
      current = (index + thumbs.length) % thumbs.length;
      var data = imageData(current);

      stageImage.src = data.src;
      stageImage.alt = data.alt;
      stageCaption.textContent = data.caption;
      stageCounter.textContent = pad(current + 1) + ' / ' + pad(thumbs.length);
      gallery.querySelector('[data-gallery-open]').setAttribute('aria-label', 'Open full screen: ' + data.caption);

      thumbs.forEach(function (thumb, i) {
        var active = i === current;
        thumb.classList.toggle('is-active', active);
        thumb.setAttribute('aria-selected', active ? 'true' : 'false');
        thumb.setAttribute('tabindex', active ? '0' : '-1');
      });

      if (!lightbox.hidden) updateLightbox();

      if (scrollThumb !== false && thumbStrip) {
        var target = thumbs[current].offsetLeft - (thumbStrip.clientWidth - thumbs[current].offsetWidth) / 2;
        if (thumbStrip.scrollTo) {
          thumbStrip.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' });
        } else {
          thumbStrip.scrollLeft = target;
        }
      }

      var next = thumbs[(current + 1) % thumbs.length];
      var preload = new Image();
      preload.src = next.getAttribute('data-full') || next.querySelector('img').getAttribute('src');
    }

    function openLightbox() {
      lastFocus = document.activeElement;
      updateLightbox();
      lightbox.hidden = false;
      document.body.classList.add('gallery-open');
      lightbox.querySelector('.lightbox__close').focus();
    }

    function closeLightbox() {
      if (lightbox.hidden) return;
      lightbox.hidden = true;
      document.body.classList.remove('gallery-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    thumbs.forEach(function (thumb, i) {
      thumb.addEventListener('click', function () { render(i); });
      thumb.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        var step = event.key === 'ArrowRight' ? 1 : -1;
        var target = (i + step + thumbs.length) % thumbs.length;
        thumbs[target].focus();
        render(target);
      });
    });

    gallery.querySelector('[data-gallery-prev]').addEventListener('click', function () { render(current - 1); });
    gallery.querySelector('[data-gallery-next]').addEventListener('click', function () { render(current + 1); });
    gallery.querySelector('[data-gallery-open]').addEventListener('click', openLightbox);

    lightbox.querySelectorAll('[data-lightbox-close]').forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
    lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', function () { render(current - 1); });
    lightbox.querySelector('[data-lightbox-next]').addEventListener('click', function () { render(current + 1); });

    document.addEventListener('keydown', function (event) {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        render(current + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        render(current - 1);
      } else if (event.key === 'Tab') {
        var focusable = Array.prototype.slice.call(lightbox.querySelectorAll('button'));
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    var touchStartX = null;
    stage.addEventListener('touchstart', function (event) {
      touchStartX = event.touches[0].clientX;
    }, { passive: true });
    stage.addEventListener('touchend', function (event) {
      if (touchStartX === null) return;
      var delta = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) > 45) render(current + (delta < 0 ? 1 : -1));
      touchStartX = null;
    }, { passive: true });

    render(0, false);
  });

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
