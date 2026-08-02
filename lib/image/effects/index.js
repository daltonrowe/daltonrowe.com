// importing this module is what registers every built-in effect

export { source, solid, gradient } from "./sources.js";
export { resize, crop, flip } from "./geometry.js";
export {
  grayscale,
  invert,
  adjust,
  levels,
  duotone,
  tint,
  threshold,
  posterize,
  opacity,
} from "./color.js";
export { blur, sharpen, vignette, grain, dither, channelShift } from "./filters.js";
export { blend, mask, flatten, blendModes } from "./composite.js";
