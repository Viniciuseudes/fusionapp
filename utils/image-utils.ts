// ARQUIVO: lib/image-utils.ts
import heic2any from "heic2any";

/**
 * Intercepta o arquivo, converte HEIC se necessário, e exporta um WebP de Alta Qualidade.
 */
export async function processImageToWebp(file: File): Promise<File> {
  let imageFile = file;

  // 1. Detecta se é arquivo de iPhone (HEIC/HEIF) e converte para JPEG base
  if (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic")
  ) {
    try {
      const convertedBlob = (await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9, // Alta qualidade na extração inicial
      })) as Blob;
      
      // Cria um File temporário JPEG para o navegador conseguir ler
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
      URL.revokeObjectURL(objectUrl); // Limpa a memória
      
      const canvas = document.createElement("canvas");
      // Mantém a resolução original (Alta Qualidade)
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Erro ao renderizar imagem no navegador."));
        return;
      }
      
      // Desenha a imagem no canvas
      ctx.drawImage(img, 0, 0);

      // Exporta como WebP puro com 90% de qualidade
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao gerar o arquivo WebP."));
            return;
          }
          
          // Troca a extensão original por .webp
          const originalName = file.name.replace(/\.[^/.]+$/, "");
          const webpFile = new File([blob], `${originalName}.webp`, {
            type: "image/webp",
          });
          
          resolve(webpFile);
        },
        "image/webp",
        0.90 // <-- 90% preserva alta qualidade e comprime muito o peso!
      );
    };

    img.onerror = () => {
      reject(new Error("O arquivo selecionado não é uma imagem válida."));
    };

    img.src = objectUrl;
  });
}