const { desktopCapturer } = require("electron");
module.exports = async function captureAllowedWindow(target) {
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 1600, height: 1200 },
    fetchWindowIcons: false,
  });
  const source = sources.find((s) => s.id.split(":")[1] === target.window);
  if (!source || source.thumbnail.isEmpty())
    throw Error(
      "The allowed window could not be captured. Check desktop capture permissions.",
    );
  const data = source.thumbnail.toJPEG(70);
  if (data.length > 8e6) throw Error("Window capture exceeds the image limit.");
  return {
    data: data.toString("base64"),
    mime: "image/jpeg",
    ...source.thumbnail.getSize(),
  };
};
