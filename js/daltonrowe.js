const projectsContainer = document.querySelector("#projects");

if (projectsContainer) {
  const projects = projectsContainer.querySelectorAll("li");
  projects.forEach(function (project) {
    const rand = Math.ceil(Math.random() * 6);
    const delay = Math.max(Math.random() * 8, 4);

    project.classList.add(`effect-${rand}`);
    project.querySelector("img").style.animationDuration = `${delay}s`;
  });
}
