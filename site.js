// ReBe Site-Wide Enhancements
(function() {

  // 0. Dynamically load header.html into #header
  function loadHeader() {
    var headerDiv = document.getElementById('header');
    if (!headerDiv) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'header.html', true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        headerDiv.innerHTML = xhr.responseText;
        // Re-run nav highlight after header loads
        highlightActiveNav();
      }
    };
    xhr.send();
  }
  loadHeader();

  // 1. Smooth scroll
  document.documentElement.style.scrollBehavior = 'smooth';

  // 2. Favicon
  if (!document.querySelector('link[rel="icon"]')) {
    var fav = document.createElement('link');
    fav.rel = 'icon';
    fav.href = 'Images/Logo.png';
    fav.type = 'image/png';
    document.head.appendChild(fav);
  }

  // 3. Meta description
  if (!document.querySelector('meta[name="description"]')) {
    var m = document.createElement('meta');
    m.name = 'description';
    m.content = 'ReBe is an ACE-informed wellbeing platform rebuilding people from the inside out. Restoring identity, belonging, and purpose in schools and workplaces.';
    document.head.appendChild(m);
  }

  // 4. Open Graph tags
  if (!document.querySelector('meta[property="og:title"]')) {
    var ogTags = [
      ['og:title', document.title || 'ReBe'],
      ['og:description', 'ACE-informed wellbeing platform restoring identity, belonging, and purpose in schools and workplaces.'],
      ['og:type', 'website'],
      ['og:image', 'Images/Hero.jpg']
    ];
    ogTags.forEach(function(tag) {
      var el = document.createElement('meta');
      el.setAttribute('property', tag[0]);
      el.content = tag[1];
      document.head.appendChild(el);
    });
  }

  // 5. Active nav highlighting (runs after header loads)
  function highlightActiveNav() {
    var page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(function(a) {
      if (a.getAttribute('href') === page) {
        a.classList.add('active');
      }
    });
  }

  // Run immediately and also after a short delay (for dynamically loaded header)
  highlightActiveNav();
  setTimeout(highlightActiveNav, 500);
  setTimeout(highlightActiveNav, 1500);
})();
