window.UrlCaster = (function () {

  var applicationID = '7EDE6C3F';

  var namespace = 'urn:x-cast:com.github.PolymerLabs.arcs.cast';
  var session = null;
  var url_to_be_casted = null;

  function initializeCastApi() {
    var sessionRequest = new chrome.cast.SessionRequest(applicationID);
    var apiConfig = new chrome.cast.ApiConfig(sessionRequest,
            sessionListener,
            receiverListener,
            chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED);
    chrome.cast.initialize(apiConfig, null, null);
  }

  function sessionListener(e) {
    session = e;
    session.addUpdateListener(sessionUpdateListener);
    if (url_to_be_casted) {
      castURL();
    }
  }

  function sessionUpdateListener(isAlive) {
     if (!isAlive) {
       session = null;
     }
  }

  function receiverListener(namespace, message) {
    // no-op for now
  }

  function setCastURL(url) {
    url_to_be_casted = url;
  }

  function castURL() {
    if (session != null) {
      session.sendMessage(namespace, url_to_be_casted);
    } else {
      chrome.cast.requestSession(sessionListener);
    }
  }

  window['__onGCastApiAvailable'] = function(isAvailable) {
    if (isAvailable) {
      initializeCastApi();
    }
  };

  return {
    set: setCastURL,
    cast: castURL
  }

  })();
