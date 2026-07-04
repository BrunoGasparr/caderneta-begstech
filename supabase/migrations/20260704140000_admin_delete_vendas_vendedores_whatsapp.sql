-- Correções administrativas: excluir vendas já feitas e remover acesso de vendedores.
-- Aplicar depois da migration 20260704130000_fix_financeiro_dashboard_rpc.sql.

-- =========================================================
-- RPC: excluir venda definitivamente, admin-only.
-- Se a venda ainda não estiver cancelada, desfaz os efeitos antes:
-- - devolve estoque;
-- - decrementa qtd_compras do cliente;
-- - reduz saldo_devedor se a venda era fiada.
-- Depois remove a venda e seus itens. Pagamentos vinculados ficam preservados
-- com venda_id = NULL por causa da FK ON DELETE SET NULL.
-- =========================================================
CREATE OR REPLACE FUNCTION public.excluir_venda_admin(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_venda record;
  v_item record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir vendas';
  END IF;

  SELECT *
  INTO v_venda
  FROM public.vendas
  WHERE id = p_venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;

  IF v_venda.status <> 'cancelada'::public.venda_status THEN
    FOR v_item IN
      SELECT *
      FROM public.itens_venda
      WHERE venda_id = p_venda_id
    LOOP
      UPDATE public.produtos
      SET quantidade = quantidade + v_item.quantidade
      WHERE id = v_item.produto_id;
    END LOOP;

    IF v_venda.cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET qtd_compras = GREATEST(qtd_compras - 1, 0),
          saldo_devedor = GREATEST(
            saldo_devedor - CASE
              WHEN v_venda.status = 'fiada'::public.venda_status THEN v_venda.valor_total
              ELSE 0
            END,
            0
          )
      WHERE id = v_venda.cliente_id;
    END IF;
  END IF;

  DELETE FROM public.vendas
  WHERE id = p_venda_id;
END;
$$;

-- =========================================================
-- RPC: remover acesso de vendedor, admin-only.
-- Não apaga auth.users nem profile, para preservar histórico de vendas.
-- Remove apenas o papel vendedor e marca a solicitação como rejeitada/removida.
-- =========================================================
CREATE OR REPLACE FUNCTION public.excluir_vendedor(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir vendedores';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode remover seu próprio acesso';
  END IF;

  IF public.has_role(p_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Não é permitido excluir outro administrador por esta ação';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = 'vendedor'::public.app_role;

  UPDATE public.solicitacoes_vendedor
  SET status = 'rejeitado'::public.solicitacao_status,
      analisado_em = now(),
      analisado_por = auth.uid(),
      observacao = 'Vendedor removido pelo administrador'
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.solicitacoes_vendedor (
      user_id,
      nome,
      email,
      status,
      analisado_em,
      analisado_por,
      observacao
    )
    SELECT
      p.id,
      p.nome,
      p.email,
      'rejeitado'::public.solicitacao_status,
      now(),
      auth.uid(),
      'Vendedor removido pelo administrador'
    FROM public.profiles p
    WHERE p.id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_venda_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.excluir_vendedor(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.excluir_venda_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_vendedor(uuid) TO authenticated;
