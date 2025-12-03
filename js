(function(){
  var script = document.getElementById('ghonlinebooking'),
    iframe = document.createElement('iframe'),
    resizer = document.createElement('script'),
    instance = script.getAttribute('data-instance'),
    offset = script.getAttribute('data-offset'),
    pageScrollSkip = true;

  obIframeUrl = 'https://onlinebooking.garagehive.co.uk';

  iframe.id = 'ghonlinebooking-iframe';
  if(script.hasAttribute('data-set')){
    url = obIframeUrl + '/' + instance + '/' + script.getAttribute('data-set') + '/booking/';
  }else{
    url = obIframeUrl + '/' + instance + '/booking/';
  }
  if(script.hasAttribute('data-location')){
    url += '?location=' + script.getAttribute('data-location');
  }
  iframe.setAttribute('src', url);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('width', '100%');
  iframe.setAttribute('allowtransparency', 'true');

  document.write(iframe.outerHTML);

  resizer.setAttribute('src', obIframeUrl + '/js/iframe/iframeResizer.min.js');
  document.write(resizer.outerHTML);

  document.addEventListener('readystatechange', function(){
    if(document.readyState == 'complete'){
      iFrameResize({
        inPageLinks: true,
        checkOrigin: false,
        onMessage: function(data){
          if(data.message == 'gh_widget_scroll'){
            if (pageScrollSkip) {
              console.log("Garage Hive widget scroll skipped.");
              pageScrollSkip = false;
              return;
            }
            console.log("Garage Hive widget scroll received.");
            data.iframe.scrollIntoView();
            window.scrollBy({
              top: document.getElementById('ghonlinebooking-iframe').getBoundingClientRect().top - offset,
              behavior: "smooth",
            });
          }
        }
      }, '#' + iframe.id);
    }
  });

  window.addEventListener('message', function(event) {
    var prefix = '[GarageHive]';
    if (event.origin != obIframeUrl) return;
    if (event.data.substring(0, 12) != prefix || event.data.substring(12) != iframe.id+'-loaded') return;

    var gaFunction = 'ga';
    if (script.hasAttribute('data-gafunction')) {
      gaFunction = script.getAttribute('data-gafunction');
    }
    window[gaFunction](function(tracker) {
      console.log("Parent ga function");
      document.getElementById(iframe.id).contentWindow.postMessage(prefix+tracker.get('clientId'), obIframeUrl);
    });
  });
})();