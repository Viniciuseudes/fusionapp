export async function processImageToWebp(file: File): Promise<File> {
  let imageFile = file;
  const originalName = file.name.replace(/\.[^/.]+$/, "");
  const isHeic = 
    file.type === "image/heic" || 
    file.type === "image/heif" || 
    file.name.toLowerCase().endsWith(".heic");

  // 1. Tratamento rigoroso de HEIC/HEIF
  if (isHeic) {
    try {
      const heicModule = await import("heic2any");
      const heic2anyFn = heicModule.default || heicModule;

      const fileUrl = URL.createObjectURL(file);
      const cleanResponse = await fetch(fileUrl);
      const cleanBlob = await cleanResponse.blob();
      URL.revokeObjectURL(fileUrl);

      let convertedBlob: Blob;

      try {
        // ==========================================
        // TENTATIVA 1: Conversão Padrão
        // Funciona para 90% dos HEICs normais
        // ==========================================
        const result = await heic2anyFn({
          blob: cleanBlob,
          toType: "image/jpeg",
          quality: 0.8, // Qualidade um pouco reduzida para evitar estouro de memória no Chrome
        });
        convertedBlob = Array.isArray(result) ? result[0] : (result as Blob);
        
      } catch (err1) {
        console.warn("HEIC Padrão falhou. Tentando modo Live Photo...", err1);
        
        // ==========================================
        // TENTATIVA 2: Conversão Complexa (Sequência/Live Photo)
        // Se a primeira falhou, tenta desempacotar múltiplas camadas
        // ==========================================
        const result = await heic2anyFn({
          blob: cleanBlob,
          toType: "image/jpeg",
          quality: 0.8,
          multiple: true, 
        });
        convertedBlob = Array.isArray(result) ? result[0] : (result as Blob);
      }

      imageFile = new File([convertedBlob], `${originalName}.jpg`, {
        type: "image/jpeg",
      });
      
    } catch (error: any) {
      console.error("HEIC Decoder falhou completamente:", error?.message || error);
      // Se estamos no Safari, o Plano B ainda vai salvar a vida. 
      // Se for no Chrome, vai cair no onerror lá embaixo.
      imageFile = file;
    }
  }

  // 2. Converte para WEBP
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

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao gerar o arquivo final."));
            return;
          }

          const mimeType = blob.type;
          let finalExt = "webp";
          if (mimeType === "image/png") finalExt = "png";
          if (mimeType === "image/jpeg") finalExt = "jpg";

          const finalFile = new File([blob], `${originalName}.${finalExt}`, {
            type: mimeType,
          });

          resolve(finalFile);
        },
        "image/webp",
        0.90
      );
    };

    img.onerror = () => {
      if (isHeic) {
        // Mensagem de erro CLARA para o usuário do Chrome Desktop saber o que fazer
        reject(new Error("O Google Chrome não conseguiu ler esta foto da Apple. Por favor, envie em formato JPG/PNG ou faça o cadastro pelo celular."));
      } else {
        reject(new Error("O arquivo selecionado está corrompido ou não é suportado."));
      }
    };

    img.src = objectUrl;
  });
}