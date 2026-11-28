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

  var heroSurfaces = Array.prototype.slice.call(document.querySelectorAll('.hero,.page-hero'));
  var heroShowcase = document.querySelector('[data-hero-showcase]');
  if (heroShowcase) {
    var projectButtons = Array.prototype.slice.call(heroShowcase.querySelectorAll('[data-hero-project]'));
    var heroMainImage = heroShowcase.querySelector('[data-hero-main]');
    var heroMiniImage = heroShowcase.querySelector('[data-hero-mini]');
    var heroCaption = heroShowcase.querySelector('[data-hero-caption]');
    projectButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        projectButtons.forEach(function (item) {
          var active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        heroMainImage.classList.add('is-changing');
        heroMiniImage.classList.add('is-changing');
        heroMainImage.src = button.dataset.mainSrc;
        heroMainImage.alt = button.dataset.mainAlt;
        heroMainImage.width = Number(button.dataset.mainWidth) || 1500;
        heroMainImage.height = Number(button.dataset.mainHeight) || 1000;
        heroMiniImage.src = button.dataset.miniSrc;
        heroMiniImage.alt = button.dataset.miniAlt;
        heroMiniImage.width = Number(button.dataset.miniWidth) || 640;
        heroMiniImage.height = Number(button.dataset.miniHeight) || 888;
        heroCaption.textContent = button.dataset.title;
        window.setTimeout(function () {
          heroMainImage.classList.remove('is-changing');
          heroMiniImage.classList.remove('is-changing');
        }, 280);
      });
    });
  }

  var heroFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (heroFinePointer && !reduced) {
    heroSurfaces.forEach(function (surface) {
      var activeTarget = null;
      surface.addEventListener('pointermove', function (event) {
        var rect = surface.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;
        surface.style.setProperty('--hero-x', (event.clientX - rect.left) + 'px');
        surface.style.setProperty('--hero-y', (event.clientY - rect.top) + 'px');
        surface.style.setProperty('--hero-grid-x', ((.5 - x) * 10) + 'px');
        surface.style.setProperty('--hero-grid-y', ((.5 - y) * 10) + 'px');

        var target = event.target.closest('h1,p,a,button,img,.feature__tag,.meta-list');
        if (target && surface.contains(target)) {
          if (activeTarget && activeTarget !== target) activeTarget.classList.remove('is-pointer-target');
          activeTarget = target;
          activeTarget.classList.add('is-pointer-target');
        } else if (activeTarget) {
          activeTarget.classList.remove('is-pointer-target');
          activeTarget = null;
        }
      });
      surface.addEventListener('pointerleave', function () {
        surface.style.setProperty('--hero-x', '50%');
        surface.style.setProperty('--hero-y', '36%');
        surface.style.setProperty('--hero-grid-x', '0px');
        surface.style.setProperty('--hero-grid-y', '0px');
        if (activeTarget) activeTarget.classList.remove('is-pointer-target');
        activeTarget = null;
      });
    });
  }
  if (heroShowcase && heroFinePointer && !reduced) {
    heroShowcase.addEventListener('pointermove', function (event) {
      var rect = heroShowcase.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - .5;
      var y = (event.clientY - rect.top) / rect.height - .5;
      heroShowcase.style.setProperty('--tilt-x', (x * 5) + 'deg');
      heroShowcase.style.setProperty('--tilt-y', (-y * 5) + 'deg');
      heroShowcase.classList.add('is-tilting');
    });
    heroShowcase.addEventListener('pointerleave', function () {
      heroShowcase.style.setProperty('--tilt-x', '0deg');
      heroShowcase.style.setProperty('--tilt-y', '0deg');
      heroShowcase.classList.remove('is-tilting');
    });
  }

  function setMenu(open, returnFocus) {
    if (!toggle || !panel) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    panel.inert = !open;
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (open) {
      window.requestAnimationFrame(function () {
        if (toggle.getAttribute('aria-expanded') === 'true') {
          var currentLink = panel.querySelector('a[aria-current="page"]');
          var firstLink = panel.querySelector('a[href]');
          (currentLink || firstLink || toggle).focus();
        }
      });
    } else if (returnFocus) {
      toggle.focus();
    }
  }

  if (toggle && panel) {
    var menuLinks = Array.prototype.slice.call(panel.querySelectorAll('a[href]'));
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;

    var activeDesktopLink = document.querySelector('.nav__link[aria-current="page"]');
    if (activeDesktopLink) {
      var activeHref = activeDesktopLink.getAttribute('href');
      var activeMenuLink = menuLinks.find(function (link) {
        return link.getAttribute('href') === activeHref && !link.classList.contains('btn');
      });
      if (activeMenuLink) activeMenuLink.setAttribute('aria-current', 'page');
    }

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      setMenu(open, !open);
    });

    menuLinks.forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false, true);
        return;
      }
      if (event.key !== 'Tab' || toggle.getAttribute('aria-expanded') !== 'true') return;
      var focusable = Array.prototype.slice.call(panel.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) {
        event.preventDefault();
        toggle.focus();
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (toggle.getAttribute('aria-expanded') === 'true' && !panel.contains(event.target) && !toggle.contains(event.target)) {
        setMenu(false);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
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

  // Project overview pop-ups. Links remain real page links without JavaScript.
  var dialog = document.getElementById('project-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    var dialogTitle = dialog.querySelector('[data-dialog-title]');
    var dialogCategory = dialog.querySelector('[data-dialog-category]');
    var dialogSummary = dialog.querySelector('[data-dialog-summary]');
    var dialogServices = dialog.querySelector('[data-dialog-services]');
    var dialogMedia = dialog.querySelector('[data-dialog-media]');
    var dialogImage = dialog.querySelector('[data-dialog-image]');
    var dialogPage = dialog.querySelector('[data-dialog-page]');
    var lastTrigger = null;

    function closeDialog() {
      if (dialog.open) dialog.close();
    }

    document.querySelectorAll('[data-project-open]').forEach(function (trigger) {
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.addEventListener('click', function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();

        var title = trigger.getAttribute('data-project-title') || '';
        var category = trigger.getAttribute('data-project-category') || '';
        var summary = trigger.getAttribute('data-project-summary') || '';
        var services = trigger.getAttribute('data-project-services') || '';
        var image = trigger.getAttribute('data-project-image') || '';
        var page = trigger.getAttribute('data-project-page') || 'portfolio.html';

        dialogTitle.textContent = title;
        dialogCategory.textContent = category;
        dialogSummary.textContent = summary;
        dialogServices.innerHTML = '';
        if (services) {
          var li = document.createElement('li');
          var left = document.createElement('span');
          var right = document.createElement('span');
          left.textContent = 'Delivered';
          right.textContent = services.split('|').map(function (item) { return item.trim(); }).filter(Boolean).join(', ');
          li.appendChild(left);
          li.appendChild(right);
          dialogServices.appendChild(li);
        }

        if (image) {
          dialogMedia.hidden = false;
          dialogImage.src = image;
          dialogImage.alt = title + ' website preview';
        } else {
          dialogMedia.hidden = true;
          dialogImage.removeAttribute('src');
        }

        dialogPage.href = page;
        dialog.setAttribute('aria-label', 'Quick overview — ' + title);
        lastTrigger = trigger;
        dialog.showModal();
        document.body.classList.add('dialog-open');
        dialog.querySelector('[data-dialog-close]').focus();
      });
    });

    dialog.querySelectorAll('[data-dialog-close]').forEach(function (button) {
      button.addEventListener('click', closeDialog);
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog();
    });

    dialog.addEventListener('close', function () {
      document.body.classList.remove('dialog-open');
      if (lastTrigger) lastTrigger.focus();
    });
  }

  // Futuristic proof strip: animate numbers once when it enters view.
  var proof = document.querySelector('.proof');
  if (proof) {
    var counters = Array.prototype.slice.call(proof.querySelectorAll('[data-count]'));

    function animateCounter(item) {
      var target = parseInt(item.getAttribute('data-count'), 10);
      var suffix = item.getAttribute('data-suffix') || '';
      var output = item.querySelector('[data-stat-value]');
      if (!output || isNaN(target)) return;
      if (reduced || !window.requestAnimationFrame) {
        output.textContent = target + suffix;
        return;
      }
      var duration = 1100;
      var start = null;
      function frame(now) {
        if (start === null) start = now;
        var progress = Math.min((now - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        output.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) window.requestAnimationFrame(frame);
        else output.textContent = target + suffix;
      }
      window.requestAnimationFrame(frame);
    }

    function activateProof() {
      if (proof.classList.contains('is-live')) return;
      proof.classList.add('is-live');
      counters.forEach(animateCounter);
    }

    if (reduced || !('IntersectionObserver' in window)) {
      activateProof();
    } else {
      var proofObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          activateProof();
          proofObserver.disconnect();
        }
      }, { threshold: 0.35 });
      proofObserver.observe(proof);
    }

    var proofCursor = proof.querySelector('[data-proof-cursor]');
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (proofCursor && !reduced && finePointer) {
      proof.addEventListener('pointermove', function (event) {
        var box = proof.getBoundingClientRect();
        var x = event.clientX - box.left;
        var y = event.clientY - box.top;
        proof.style.setProperty('--mx', x + 'px');
        proof.style.setProperty('--my', y + 'px');
        proofCursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%)';
        proofCursor.classList.add('is-visible');
      });

      proof.addEventListener('pointerleave', function () {
        proofCursor.classList.remove('is-visible');
        proof.style.setProperty('--mx', '50%');
        proof.style.setProperty('--my', '50%');
      });
    }
  }

  var trackingCards = document.querySelectorAll('.contact-option, .contact-social');
  var canTrackPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (canTrackPointer && !reduced) {
    trackingCards.forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--pointer-x', (event.clientX - rect.left) + 'px');
        card.style.setProperty('--pointer-y', (event.clientY - rect.top) + 'px');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--pointer-x', '50%');
        card.style.setProperty('--pointer-y', '50%');
      });
    });
  }

  var emailDialog = document.getElementById('email-dialog');
  if (emailDialog) {
    var emailForm = document.getElementById('email-compose-form');
    var emailOpener = null;
    document.querySelectorAll('[data-email-dialog-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        emailOpener = button;
        if (typeof emailDialog.showModal === 'function') emailDialog.showModal();
        else emailDialog.setAttribute('open', '');
        var firstInput = emailDialog.querySelector('input');
        if (firstInput) firstInput.focus();
      });
    });
    emailDialog.querySelectorAll('[data-email-dialog-close]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (typeof emailDialog.close === 'function') emailDialog.close();
        else emailDialog.removeAttribute('open');
      });
    });
    emailDialog.addEventListener('click', function (event) {
      if (event.target === emailDialog && typeof emailDialog.close === 'function') emailDialog.close();
    });
    emailDialog.addEventListener('close', function () {
      if (emailOpener) emailOpener.focus();
    });
    function getEmailDraft() {
      var values = new FormData(emailForm);
      var name = String(values.get('name') || '').trim();
      var replyEmail = String(values.get('replyEmail') || '').trim();
      var subject = String(values.get('subject') || 'Website project enquiry').trim();
      var message = String(values.get('message') || '').trim();
      var body = 'Name: ' + name + '\nReply email: ' + replyEmail + '\n\n' + message;
      return { subject: subject, body: body };
    }
    function closeEmailDialog() {
      if (typeof emailDialog.close === 'function') emailDialog.close();
      else emailDialog.removeAttribute('open');
    }
    var emailStatus = emailDialog.querySelector('[data-email-status]');
    if (emailForm) {
      emailForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var draft = getEmailDraft();
        var gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent('htechdigitalconcept@gmail.com') + '&su=' + encodeURIComponent(draft.subject) + '&body=' + encodeURIComponent(draft.body);
        var composeWindow = window.open(gmailUrl, '_blank');
        if (composeWindow) {
          composeWindow.opener = null;
          closeEmailDialog();
        } else if (emailStatus) {
          emailStatus.textContent = 'Your browser blocked the Gmail tab. Choose “Use device mail app” below, or email htechdigitalconcept@gmail.com directly.';
        }
      });
    }
    var nativeMailButton = emailDialog.querySelector('[data-email-native]');
    if (nativeMailButton && emailForm) {
      nativeMailButton.addEventListener('click', function () {
        var draft = getEmailDraft();
        var mailtoUrl = 'mailto:htechdigitalconcept@gmail.com?subject=' + encodeURIComponent(draft.subject) + '&body=' + encodeURIComponent(draft.body);
        window.location.href = mailtoUrl;
        closeEmailDialog();
      });
    }
  }

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

/* Hero: rotating role line (typewriter) */
(function () {
  var role = document.querySelector('.role[data-roles]');
  if (!role) return;
  var out = role.querySelector('.role__text'), list;
  try { list = JSON.parse(role.getAttribute('data-roles')); } catch (e) { return; }
  list = list.map(function (t) { var d = document.createElement('div'); d.innerHTML = t; return d.textContent; });
  if (!list.length || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  var i = 0, n = 0, deleting = false;
  function tick() {
    var word = list[i], delay;
    if (!deleting) {
      n++; out.textContent = word.slice(0, n);
      if (n === word.length) { deleting = true; delay = 1700; } else { delay = 60; }
    } else {
      n--; out.textContent = word.slice(0, n);
      if (n === 0) { deleting = false; i = (i + 1) % list.length; delay = 350; } else { delay = 30; }
    }
    setTimeout(tick, delay);
  }
  setTimeout(tick, 1800);
})();


/* Hero: auto-rotate the featured project every few seconds */
(function () {
  var box = document.querySelector('[data-hero-showcase]');
  if (!box) return;
  var tabs = Array.prototype.slice.call(box.querySelectorAll('[data-hero-project]')), bar = box.querySelector('[data-hero-progress]');
  if (tabs.length < 2 || !bar) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var DUR = 6000, t = 0, last = null, hold = false, visible = true;
  function next() {
    var i = tabs.findIndex(function (b) { return b.classList.contains('is-active'); });
    tabs[(i + 1) % tabs.length].click();
  }
  function frame(ts) {
    if (last === null) last = ts;
    var dt = ts - last; last = ts;
    if (!hold && visible && !document.hidden) {
      t += Math.min(dt, 100);
      bar.style.transform = 'scaleX(' + Math.min(t / DUR, 1) + ')';
      if (t >= DUR) { t = 0; bar.style.transform = 'scaleX(0)'; next(); }
    }
    requestAnimationFrame(frame);
  }
  tabs.forEach(function (b) { b.addEventListener('click', function () { t = 0; bar.style.transform = 'scaleX(0)'; }); });
  box.addEventListener('pointerenter', function () { hold = true; });
  box.addEventListener('pointerleave', function () { hold = false; });
  box.addEventListener('focusin', function () { hold = true; });
  box.addEventListener('focusout', function () { hold = false; });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }, { threshold: .25 }).observe(box);
  requestAnimationFrame(frame);
})();
