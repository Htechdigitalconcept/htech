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

  var growthTool = document.querySelector('[data-growth-tool]');
  if (growthTool) {
    var growthForm = growthTool.querySelector('[data-growth-form]');
    var growthPanels = Array.prototype.slice.call(growthTool.querySelectorAll('[data-growth-step]'));
    var growthIndicators = Array.prototype.slice.call(growthTool.querySelectorAll('[data-growth-indicator]'));
    var growthStatus = growthTool.querySelector('[data-growth-status]');
    var growthProgress = growthTool.querySelector('[data-growth-progress]');
    var websiteField = growthTool.querySelector('[data-growth-website]');
    var answerCount = growthTool.querySelector('[data-growth-answer-count]');
    var answerProgress = growthTool.querySelector('[data-growth-answer-progress]');
    var questionGroups = Array.prototype.slice.call(growthTool.querySelectorAll('[data-growth-question]'));
    var report = growthTool.querySelector('[data-growth-report]');
    var currentGrowthStep = 1;
    var websiteReference = '';
    var growthCategories = [
      { id: 'clarity', label: 'Offer clarity' },
      { id: 'trust', label: 'Trust & proof' },
      { id: 'mobile', label: 'Mobile experience' },
      { id: 'conversion', label: 'Conversion path' },
      { id: 'performance', label: 'Performance' }
    ];

    function setGrowthStep(step, shouldScroll) {
      currentGrowthStep = step;
      growthPanels.forEach(function (panel) {
        var active = Number(panel.dataset.growthStep) === step;
        panel.hidden = !active;
        panel.querySelectorAll('input,select,textarea,button').forEach(function (control) {
          control.disabled = !active;
        });
      });
      growthIndicators.forEach(function (indicator) {
        var indicatorStep = Number(indicator.dataset.growthIndicator);
        indicator.classList.toggle('is-complete', indicatorStep < step);
        if (indicatorStep === step) indicator.setAttribute('aria-current', 'step');
        else indicator.removeAttribute('aria-current');
      });
      if (growthProgress) growthProgress.style.width = ((step / 3) * 100) + '%';
      if (growthStatus) {
        growthStatus.textContent = step === 1 ? 'Step 1 of 3 · Tell us a little about your business.' :
          step === 2 ? 'Step 2 of 3 · Answer ten quick questions about the experience you offer.' :
            'Step 3 of 3 · Your personalized action plan is ready.';
      }
      if (shouldScroll) {
        var growthAnchor = document.getElementById('growth-tool');
        if (growthAnchor) growthAnchor.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        window.requestAnimationFrame(function () {
          var activePanel = growthPanels.find(function (panel) { return Number(panel.dataset.growthStep) === step; });
          var stepHeading = activePanel && activePanel.querySelector('h3');
          if (stepHeading) {
            stepHeading.setAttribute('tabindex', '-1');
            stepHeading.focus({ preventScroll: true });
          }
        });
      }
    }

    function updateGrowthAnswerProgress() {
      var answered = questionGroups.filter(function (question) {
        return question.querySelector('input[type="radio"]:checked');
      }).length;
      if (answerCount) answerCount.innerHTML = answered + ' <i>/ ' + questionGroups.length + ' answered</i>';
      if (answerProgress) answerProgress.style.width = (questionGroups.length ? answered / questionGroups.length * 100 : 0) + '%';
    }

    function createGrowthNode(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function readWebsiteReference() {
      if (!websiteField) return { valid: true, host: '' };
      var raw = websiteField.value.trim();
      websiteField.setCustomValidity('');
      if (!raw) return { valid: true, host: '' };
      var candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
      try {
        var parsed = new URL(candidate);
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) throw new Error('Invalid website');
        return { valid: true, host: parsed.hostname.replace(/^www\./i, '') };
      } catch (error) {
        websiteField.setCustomValidity('Enter a website such as example.com, or leave this optional field blank.');
        websiteField.reportValidity();
        return { valid: false, host: '' };
      }
    }

    function buildGrowthReport() {
      var results = questionGroups.map(function (question, index) {
        var selected = question.querySelector('input[type="radio"]:checked');
        return {
          value: selected ? Number(selected.value) : 0,
          category: question.dataset.category,
          action: question.dataset.action,
          reason: question.dataset.reason,
          title: question.querySelector('legend b').textContent.trim(),
          order: index
        };
      });
      var total = results.reduce(function (sum, result) { return sum + result.value; }, 0);
      var score = Math.round(total / (questionGroups.length * 2) * 100);
      var industryField = growthForm.querySelector('[name="industry"]');
      var goalField = growthForm.querySelector('[name="goal"]');
      var industry = industryField.options[industryField.selectedIndex].textContent;
      var goal = goalField.options[goalField.selectedIndex].textContent;
      var heading = score < 40 ? 'Start with the essentials.' : score < 65 ? 'A good base. Now remove friction.' : score < 85 ? 'Strong foundations. Refine the journey.' : 'A confident foundation. Keep improving.';
      var intro = score < 40 ? 'Your answers point to a few important opportunities to make the site clearer, more reassuring and easier to use.' :
        score < 65 ? 'There are useful foundations here. A few focused improvements could make the path from first visit to action much clearer.' :
          score < 85 ? 'Your website appears to cover many of the essentials. Focus on the small details that make action feel effortless.' :
            'Your answers suggest a thoughtful experience. Keep validating it with real customers and testing small improvements.';
      var categoryResults = growthCategories.map(function (category) {
        var items = results.filter(function (result) { return result.category === category.id; });
        var points = items.reduce(function (sum, result) { return sum + result.value; }, 0);
        return { label: category.label, score: Math.round(points / (items.length * 2) * 100) };
      });
      var priorities = results.filter(function (result) { return result.value < 2; }).sort(function (a, b) {
        return a.value - b.value || a.order - b.order;
      }).slice(0, 3);
      if (!priorities.length) {
        priorities = [
          { value: 2, category: 'clarity', title: 'Pressure-test your first impression.', action: 'Ask someone unfamiliar with the business to explain your offer after a five-second look at the homepage.', reason: 'A fresh perspective can reveal gaps that are hard to spot when you know the business well.' },
          { value: 2, category: 'conversion', title: 'Test one call to action.', action: 'Try a more specific action label and compare how visitors respond over a meaningful period.', reason: 'Small, measured tests can show which next step feels clearest to your customers.' },
          { value: 2, category: 'mobile', title: 'Review the site on a slower connection.', action: 'Open the key pages on a phone using mobile data and note what appears first and what feels slow.', reason: 'Real-world conditions can differ from a fast office connection.' }
        ];
      }
      report.replaceChildren();

      var overview = createGrowthNode('div', 'growth-report__overview');
      var scoreRing = createGrowthNode('div', 'growth-score');
      scoreRing.style.setProperty('--growth-score', score + '%');
      scoreRing.setAttribute('role', 'img');
      scoreRing.setAttribute('aria-label', 'Self-check score: ' + score + ' out of 100');
      var scoreInner = createGrowthNode('div', 'growth-score__inner');
      scoreInner.appendChild(createGrowthNode('strong', 'growth-score__number', String(score)));
      scoreInner.appendChild(createGrowthNode('span', 'growth-score__unit', 'out of 100'));
      scoreRing.appendChild(scoreInner);
      overview.appendChild(scoreRing);
      var overviewCopy = createGrowthNode('div', 'growth-report__copy');
      overviewCopy.appendChild(createGrowthNode('span', 'growth-report__eyebrow', 'YOUR SELF-CHECK · ' + industry.toUpperCase()));
      overviewCopy.appendChild(createGrowthNode('h4', '', heading));
      overviewCopy.appendChild(createGrowthNode('p', '', intro + ' This plan is shaped around your goal to ' + goal.toLowerCase() + '.'));
      if (websiteReference) overviewCopy.appendChild(createGrowthNode('p', 'growth-report__domain', 'Website reference · ' + websiteReference));
      overview.appendChild(overviewCopy);
      report.appendChild(overview);

      var categoriesBlock = createGrowthNode('div', 'growth-report__category-block');
      categoriesBlock.appendChild(createGrowthNode('p', 'growth-report__section-label', 'Your five growth signals'));
      var categoryGrid = createGrowthNode('div', 'growth-report__categories');
      categoryResults.forEach(function (category) {
        var card = createGrowthNode('div', 'growth-category');
        var cardHead = createGrowthNode('div', 'growth-category__head');
        cardHead.appendChild(createGrowthNode('span', '', category.label));
        cardHead.appendChild(createGrowthNode('span', '', category.score + '%'));
        card.appendChild(cardHead);
        var bar = createGrowthNode('div', 'growth-category__bar');
        bar.setAttribute('aria-hidden', 'true');
        var fill = createGrowthNode('span');
        fill.style.setProperty('--category-score', category.score + '%');
        bar.appendChild(fill);
        card.appendChild(bar);
        categoryGrid.appendChild(card);
      });
      categoriesBlock.appendChild(categoryGrid);
      report.appendChild(categoriesBlock);

      var prioritiesBlock = createGrowthNode('div', 'growth-report__priority-block');
      prioritiesBlock.appendChild(createGrowthNode('p', 'growth-report__section-label', priorities.some(function (item) { return item.value < 2; }) ? 'Your highest-priority opportunities' : 'Keep your momentum going'));
      var prioritiesGrid = createGrowthNode('div', 'growth-report__priorities');
      priorities.forEach(function (item, index) {
        var category = growthCategories.find(function (entry) { return entry.id === item.category; });
        var card = createGrowthNode('article', 'growth-priority');
        card.appendChild(createGrowthNode('span', 'growth-priority__meta', String(index + 1).padStart(2, '0') + ' / ' + (category ? category.label : 'NEXT STEP')));
        card.appendChild(createGrowthNode('h5', '', item.title));
        card.appendChild(createGrowthNode('p', '', item.action));
        if (item.reason) card.appendChild(createGrowthNode('p', 'growth-priority__reason', item.reason));
        prioritiesGrid.appendChild(card);
      });
      prioritiesBlock.appendChild(prioritiesGrid);
      report.appendChild(prioritiesBlock);

      report.appendChild(createGrowthNode('p', 'growth-report__footnote', 'This score reflects your answers only. It is not a live technical scan, an industry benchmark or a promise of specific business results.'));
      var reportCta = createGrowthNode('div', 'growth-report__cta');
      reportCta.appendChild(createGrowthNode('p', '', 'Want a specialist to help you work through these priorities?'));
      var contactLink = createGrowthNode('a', 'btn btn--blue', 'Talk through my action plan');
      contactLink.href = 'contact.html?source=growth-check';
      contactLink.appendChild(createGrowthNode('span', 'btn__arrow', '→'));
      contactLink.setAttribute('aria-label', 'Talk through my website action plan');
      reportCta.appendChild(contactLink);
      report.appendChild(reportCta);
    }

    questionGroups.forEach(function (question) {
      question.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          question.querySelectorAll('.growth-choices label').forEach(function (label) {
            label.classList.toggle('is-selected', !!label.querySelector('input:checked'));
          });
          question.classList.add('is-answered');
          updateGrowthAnswerProgress();
        });
      });
    });

    if (websiteField) websiteField.addEventListener('input', function () { websiteField.setCustomValidity(''); });

    growthTool.querySelectorAll('[data-growth-next]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!growthForm.reportValidity()) return;
        if (currentGrowthStep === 1) {
          var website = readWebsiteReference();
          if (!website.valid) return;
          websiteReference = website.host;
          setGrowthStep(2, true);
        } else if (currentGrowthStep === 2) {
          buildGrowthReport();
          setGrowthStep(3, true);
        }
      });
    });

    growthTool.querySelectorAll('[data-growth-back]').forEach(function (button) {
      button.addEventListener('click', function () { setGrowthStep(Number(button.dataset.growthBack), true); });
    });

    var resetGrowthButton = growthTool.querySelector('[data-growth-reset]');
    if (resetGrowthButton) {
      resetGrowthButton.addEventListener('click', function () {
        growthForm.reset();
        if (websiteField) websiteField.setCustomValidity('');
        questionGroups.forEach(function (question) {
          question.classList.remove('is-answered');
          question.querySelectorAll('.growth-choices label').forEach(function (label) { label.classList.remove('is-selected'); });
        });
        websiteReference = '';
        if (report) report.replaceChildren();
        updateGrowthAnswerProgress();
        setGrowthStep(1, true);
      });
    }

    var printGrowthButton = growthTool.querySelector('[data-growth-print]');
    if (printGrowthButton) {
      printGrowthButton.addEventListener('click', function () {
        document.body.classList.add('is-printing-growth');
        window.print();
      });
      window.addEventListener('afterprint', function () { document.body.classList.remove('is-printing-growth'); });
    }

    growthForm.addEventListener('submit', function (event) { event.preventDefault(); });
    updateGrowthAnswerProgress();
    setGrowthStep(1, false);
  }

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
