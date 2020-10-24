window.daltonrowe = {};

window.daltonrowe.randomToX = function (x) {
  return Math.floor(Math.random() * x);
};

// w3c special, hadn't done this without deps before
window.daltonrowe.getCookie = function (cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }

  return "";
};

window.daltonrowe.getQueryVar = function (qname) {
  const queryVars = new URLSearchParams(window.location.search);
  return queryVars.get(qname);
};

window.daltonrowe.loadTheme = function (themeNumber) {
  const themeScript = document.createElement("SCRIPT");
  themeScript.src = `js/theme${themeNumber}.js`;

  const themeStyle = document.createElement("LINK");
  themeStyle.href = `css/theme${themeNumber}.css`;
  themeStyle.rel = "stylesheet";

  document.body.appendChild(themeStyle);
  document.body.appendChild(themeScript);
};

window.daltonrowe.startFun = function () {
  const numberOfFunThemes = 2;
  let selectedTheme = window.daltonrowe.randomToX(numberOfFunThemes);

  if (window.daltonrowe.getCookie("lastTheme") == selectedTheme) {
    selectedTheme++;
    if (selectedTheme > numberOfFunThemes) selectedTheme = 0;
  }

  const queryTheme = window.daltonrowe.getQueryVar("theme");
  console.log(queryTheme);
  if (queryTheme) selectedTheme = queryTheme;

  if (selectedTheme > 0) {
    console.log("hey there, loading theme...");
    window.daltonrowe.loadTheme(selectedTheme);
  } else {
    console.log("nothing fancy, theme 0");
  }

  document.cookie = `lastTheme=${selectedTheme}`;
};

if (window.daltonrowe.getQueryVar("fun") === "true") {
  window.daltonrowe.startFun();
}
