// ARQUIVO: lib/image-utils.ts

// ❌ O SEGREDO ESTÁ AQUI: Removemos o import fixo do topo!
// Não use: import heic2any from "heic2any";

/**
 * Intercepta o arquivo, converte HEIC se necessário, e exporta um WebP de Alta Qualidade.
 */
export async function processImageToWebp(file: File): Promise<File> {
  let imageFile = file;

  // 1. Detecta se é arquivo de iPhone (HEIC/HEIF)
  if (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic")
  ) {
    try {
      // ==========================================
      // CORREÇÃO SÊNIOR: Importação Dinâmica (Lazy Loading)
      // O Next.js vai ignorar isso no servidor. A biblioteca só 
      // será baixada e executada quando a função for acionada no navegador.
      // ==========================================
      const heic2any = (await import("heic2any")).default;

      const convertedBlob = (await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9, 
      })) as Blob;
      
      imageFile = new File([convertedBlob], file.name.replace(/\.heic$/i, ".jpg"), {
        type: "image/jpeg",
      });
    } catch (error) {
      console.error("Erro ao converter HEIC:", error);
      throw new Error("Falha ao processar a foto do iPhone. Tente outra imagem.");
    }
  }

  // 2. Converte a imagem (agora legível) para WEBP usando HTML5 Canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imageFile);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); 
      
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Erro ao renderizar imagem no navegador."));
        return;
      }
      
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao gerar o arquivo WebP."));
            return;
          }
          
          const originalName = file.name.replace(/\.[^/.]+$/, "");
          const webpFile = new File([blob], `${originalName}.webp`, {
            type: "image/webp",
          });
          
          resolve(webpFile);
        },
        "image/webp",
        0.90 
      );
    };

    img.onerror = () => {
      reject(new Error("O arquivo selecionado não é uma imagem válida."));
    };

    img.src = objectUrl;
  });
}