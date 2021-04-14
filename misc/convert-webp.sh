# https://www.digitalocean.com/community/tutorials/how-to-create-and-serve-webp-images-to-speed-up-your-website

# converting JPEG images
find $1 -type f -and \( -iname "*.jpg" -o -iname "*.jpeg" \) \
-exec bash -c '
webp_path=$(sed 's/\.[^.]*$/.webp/' <<< "$0");
if [ ! -f "$webp_path" ]; then
  cwebp -quiet -q 90 "$0" -o "$webp_path";
fi;' {} \;

# converting PNG images
find $1 -type f -and -iname "*.webp" \
-exec bash -c '
webp_path=$(sed 's/\.[^.]*$/.webp/' <<< "$0");
if [ ! -f "$webp_path" ]; then
  cwebp -quiet -near_lossless 75 "$0" -o "$webp_path";
fi;' {} \;