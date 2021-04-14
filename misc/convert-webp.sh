# https://www.digitalocean.com/community/tutorials/how-to-create-and-serve-png-images-to-speed-up-your-website

# converting JPEG images
find $1 -type f -and \( -iname "*.jpg" -o -iname "*.jpeg" \) \
-exec bash -c '
png_path=$(sed 's/\.[^.]*$/.png/' <<< "$0");
if [ ! -f "$png_path" ]; then
  cpng -quiet -q 90 "$0" -o "$png_path";
fi;' {} \;

# converting PNG images
find $1 -type f -and -iname "*.png" \
-exec bash -c '
png_path=$(sed 's/\.[^.]*$/.png/' <<< "$0");
if [ ! -f "$png_path" ]; then
  cpng -quiet -near_lossless 75 "$0" -o "$png_path";
fi;' {} \;