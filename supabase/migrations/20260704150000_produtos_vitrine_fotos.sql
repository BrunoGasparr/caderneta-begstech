-- Catálogo visual: permite salvar foto do produto (upload/câmera)
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS foto_url text;
