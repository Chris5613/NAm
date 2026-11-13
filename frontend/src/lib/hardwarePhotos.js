// Small, persistent hardware photos and a built-in RTX 5080 illustration.
// Keep uploaded pictures compact: hardware register data is synced as JSON.
const fallbackSvg = (label) => {
  const safe=String(label||"GPU").replace(/[^a-zA-Z0-9 -]/g,"").slice(0,24);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200">
    <defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#131c27"/><stop offset="1" stop-color="#193444"/></linearGradient></defs>
    <rect width="340" height="200" rx="16" fill="url(#p)"/>
    <rect x="18" y="35" width="304" height="118" rx="15" fill="#0b1017" stroke="#537084" stroke-width="2"/>
    <rect x="29" y="46" width="282" height="96" rx="9" fill="#111e29" stroke="#28465a"/>
    <g fill="#243746" stroke="#91b6cb" stroke-width="3">
      <circle cx="105" cy="94" r="39"/><circle cx="235" cy="94" r="39"/>
    </g>
    <g fill="#8cb2c4"><path d="M105 60 95 87 74 73 89 99 67 110 97 111 94 134 111 111 132 127 121 99 141 86 112 89Z"/><path d="M235 60 225 87 204 73 219 99 197 110 227 111 224 134 241 111 262 127 251 99 271 86 242 89Z"/></g>
    <g fill="#0b1017" stroke="#a2c9dd" stroke-width="2"><circle cx="105" cy="94" r="12"/><circle cx="235" cy="94" r="12"/></g>
    <rect x="294" y="65" width="18" height="57" rx="2" fill="#537084"/>
    <text x="170" y="181" fill="#def5ff" font-family="Arial,sans-serif" font-size="19" font-weight="700" text-anchor="middle">${safe}</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
};
export function hardwareImageFor(device) {
  if(typeof device?.photo==="string" && /^data:image\/(?:jpeg|png|webp);base64,/.test(device.photo)) return device.photo;
  const name=String(device?.name||"").toLowerCase();
  if(name.includes("2080")) return "/gpu/rtx2080-super.webp";
  if(name.includes("5070")) return "/gpu/rtx5070-msi.webp";
  return fallbackSvg(name.includes("5080") ? "RTX 5080" : "GPU");
}
// Re-encode even small uploads to avoid filling the remote JSON store.
// Raster photos only (not SVG), max 160 KB compressed.
export async function prepareHardwarePhoto(file) {
  if(!file || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP photo.");
  if(file.size>12*1024*1024) throw new Error("Choose an image smaller than 12 MB.");
  const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error("Unable to read this photo."));
    reader.readAsDataURL(file);
  });
  const image=await new Promise((resolve,reject)=>{
    const img=new Image(); img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("Unable to open this photo."));
    img.src=data;
  });
  const canvas=document.createElement("canvas");
  const factor=Math.min(1,760/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*factor));
  canvas.height=Math.max(1,Math.round(image.height*factor));
  canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [0.8,0.65,0.5,0.35]){
    const result=canvas.toDataURL("image/jpeg",quality);
    if(result.length<215000) return result;
  }
  throw new Error("Photo is too large after compression. Try a smaller image.");
}
