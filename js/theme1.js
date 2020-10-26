// no styles

console.log("1:", "The document web to keep you honest");

const allStyles = document.querySelectorAll('link[rel="stylesheet"]');

for (let i = 0; i < allStyles.length; i++) {
  const style = allStyles[i];
  style.remove();
}
