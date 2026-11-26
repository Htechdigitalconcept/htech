(function(){
  'use strict';
  var body=document.body;
  body.classList.add('js');

  var menuButton=document.querySelector('.menu-toggle');
  var navPanel=document.getElementById('nav-panel');
  function setMenu(open){
    if(!menuButton||!navPanel)return;
    menuButton.setAttribute('aria-expanded',String(open));
    menuButton.setAttribute('aria-label',open?'Close menu':'Open menu');
    navPanel.hidden=!open;
  }
  if(menuButton&&navPanel){
    menuButton.addEventListener('click',function(){setMenu(menuButton.getAttribute('aria-expanded')!=='true')});
    navPanel.addEventListener('click',function(e){if(e.target.closest('a'))setMenu(false)});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')setMenu(false)});
    document.addEventListener('click',function(e){if(menuButton.getAttribute('aria-expanded')==='true'&&!e.target.closest('.site-header')&&!e.target.closest('.nav-panel'))setMenu(false)});
  }

  var revealItems=document.querySelectorAll('.reveal');
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if('IntersectionObserver' in window&&!reduceMotion){
    var revealObserver=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target)}})},{threshold:.12,rootMargin:'0px 0px -35px 0px'});
    revealItems.forEach(function(item){revealObserver.observe(item)});
  }else{revealItems.forEach(function(item){item.classList.add('is-visible')})}

  var year=document.getElementById('year');
  if(year)year.textContent=new Date().getFullYear();
  var statItems=document.querySelectorAll('[data-count]');
  function countUp(item){
    var value=item.querySelector('[data-stat-value]');
    var target=parseInt(item.dataset.count,10)||0;
    var suffix=item.dataset.suffix||'';
    if(!value)return;
    if(reduceMotion){value.textContent=target+suffix;return}
    var start=0,duration=1100,startTime=null;
    function frame(time){startTime=startTime||time;var t=Math.min((time-startTime)/duration,1);var eased=1-Math.pow(1-t,3);value.textContent=Math.round(target*eased)+suffix;if(t<1)requestAnimationFrame(frame)}
    requestAnimationFrame(frame);
  }
  if('IntersectionObserver' in window){
    var statObserver=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){countUp(entry.target);statObserver.unobserve(entry.target)}})},{threshold:.4});
    statItems.forEach(function(item){statObserver.observe(item)});
  }else{statItems.forEach(countUp)}

  var dialog=document.getElementById('project-dialog');
  var currentOpener=null;
  if(dialog){
    var title=dialog.querySelector('[data-dialog-title]');
    var category=dialog.querySelector('[data-dialog-category]');
    var summary=dialog.querySelector('[data-dialog-summary]');
    var image=dialog.querySelector('[data-dialog-image]');
    var media=dialog.querySelector('[data-dialog-media]');
    var list=dialog.querySelector('[data-dialog-services]');
    document.querySelectorAll('[data-project-open]').forEach(function(card){
      card.addEventListener('click',function(){
        currentOpener=card;
        var d=card.dataset;
        title.textContent=d.projectTitle||'Project overview';
        category.textContent=d.projectCategory||'';
        summary.textContent=d.projectSummary||'';
        var services=(d.projectServices||'').split('|').filter(Boolean);
        list.innerHTML=services.map(function(service){var li=document.createElement('li');li.textContent=service;return li.outerHTML}).join('');
        if(d.projectImage){image.src=d.projectImage;image.alt=d.projectTitle+' website preview';image.hidden=false;media.classList.remove('is-placeholder')}
        else{image.removeAttribute('src');image.alt='';image.hidden=true;media.classList.add('is-placeholder');media.dataset.initials=(d.projectTitle||'Project').split(/\s+/).map(function(word){return word.charAt(0)}).join('').slice(0,3).toUpperCase()}
        if(typeof dialog.showModal==='function')dialog.showModal();
      });
    });
    dialog.querySelectorAll('[data-dialog-close]').forEach(function(button){button.addEventListener('click',function(){dialog.close()})});
    dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close()});
    dialog.addEventListener('close',function(){if(currentOpener)currentOpener.focus()});
    var contactLink=dialog.querySelector('[data-dialog-contact]');
    if(contactLink)contactLink.addEventListener('click',function(){if(dialog.open)dialog.close()});
  }

  var header=document.getElementById('site-header');
  function updateHeader(){if(header)header.classList.toggle('is-scrolled',window.scrollY>12)}
  updateHeader();window.addEventListener('scroll',updateHeader,{passive:true});
})();
