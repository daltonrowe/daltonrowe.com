window.daltonrowe = {};

window.daltonrowe.randomToX = function (x) {
  return Math.floor(Math.random() * x) + 1;
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

const numberOfFunThemes = 1;
const selectedTheme = window.daltonrowe.randomToX(numberOfFunThemes);

console.log("hey there, loading theme: ", selectedTheme);
window.daltonrowe.loadTheme(selectedTheme);
