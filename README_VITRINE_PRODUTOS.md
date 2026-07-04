# Ajustes de Vitrine Virtual — Estoque e Vendas

## O que foi alterado

- Tela de **Estoque** refeita em formato de catálogo/vitrine de produtos.
- Tela de **Nova Venda** refeita com cards de produto, busca simples e seleção por **+ / -**.
- Inclusão de **foto do produto** no cadastro, com suporte a:
  - tirar foto da câmera (`accept="image/*"` + `capture="environment"`)
  - upload da galeria/arquivo
- Foto salva em `produtos.foto_url` como Data URL (MVP, sem bucket obrigatório).
- Produtos sem foto exibem placeholder visual.
- Página de detalhe do estoque passa a exibir a foto do produto.

## Migration nova

Aplicar no Supabase SQL Editor:

- `supabase/migrations/20260704150000_produtos_vitrine_fotos.sql`

## Observação

Para o site online refletir as mudanças:

1. aplicar a migration no banco
2. subir os arquivos para o GitHub/Lovable
3. publicar/deploy novamente
