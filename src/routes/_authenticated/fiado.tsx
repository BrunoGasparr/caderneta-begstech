import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreditCard, DollarSign, MessageCircle, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fiado")({
  component: FiadoPage,
});

function FiadoPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [openCliente, setOpenCliente] = useState<string | null>(null);
  const [openLimiteCliente, setOpenLimiteCliente] = useState<string | null>(null);

  const { data: devedores = [] } = useQuery({
    queryKey: ["fiado-devedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone, limite_fiado, saldo_devedor, qtd_compras")
        .gt("saldo_devedor", 0)
        .order("saldo_devedor", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const clienteIds = useMemo(() => devedores.map((c) => c.id), [devedores]);

  const { data: vendasFiadas = [] } = useQuery({
    queryKey: ["fiado-vendas-em-aberto", clienteIds.join(",")],
    enabled: clienteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select("id, cliente_id, criado_em, valor_total, status, forma_pagamento")
        .in("cliente_id", clienteIds)
        .eq("forma_pagamento", "fiado")
        .neq("status", "cancelada")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const diasDividaPorCliente = useMemo(() => {
    const map: Record<string, number> = {};
    const hoje = new Date();
    for (const venda of vendasFiadas) {
      if (!venda.cliente_id || map[venda.cliente_id] !== undefined) continue;
      const criadaEm = new Date(venda.criado_em);
      const diffMs = hoje.getTime() - criadaEm.getTime();
      map[venda.cliente_id] = Math.max(0, Math.floor(diffMs / 86_400_000));
    }
    return map;
  }, [vendasFiadas]);

  const { data: pagamentos = [] } = useQuery({
    queryKey: ["fiado-pagamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos_fiado")
        .select("id, valor_pago, data_pagamento, observacao, venda_id, clientes(nome)")
        .order("data_pagamento", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const registrar = useMutation({
    mutationFn: async (p: { cliente_id: string; valor: number; obs: string }) => {
      const { error } = await supabase.rpc("registrar_pagamento_fiado", {
        p_cliente_id: p.cliente_id,
        p_valor: p.valor,
        p_observacao: p.obs || null,
        p_venda_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrado");
      qc.invalidateQueries();
      setOpenCliente(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarLimite = useMutation({
    mutationFn: async (p: { cliente_id: string; limite: number }) => {
      const { error } = await supabase.rpc("alterar_limite_fiado", {
        p_cliente_id: p.cliente_id,
        p_novo_limite: p.limite,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite de fiado atualizado");
      qc.invalidateQueries();
      setOpenLimiteCliente(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalAberto = devedores.reduce((s, c) => s + Number(c.saldo_devedor), 0);
  const cliAtivo = devedores.find((c) => c.id === openCliente);
  const cliLimite = devedores.find((c) => c.id === openLimiteCliente);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fiado</h1>
        <p className="text-sm text-muted-foreground">
          Limite inicial R$ 100,00 · Liberado a partir da 3ª compra · Somente administrador altera
          limites e registra pagamentos
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Clientes devendo</p>
            <p className="text-2xl font-bold mt-1">{devedores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Total em aberto</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{formatBRL(totalAberto)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Saldo devedor por cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Limite</TableHead>
                <TableHead>Disponível</TableHead>
                <TableHead>Deve</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devedores.map((c) => {
                const disponivel = Number(c.limite_fiado) - Number(c.saldo_devedor);
                const diasDivida = diasDividaPorCliente[c.id] ?? 0;
                const whatsappUrl = buildCobrancaWhatsAppUrl({
                  nome: c.nome,
                  telefone: c.telefone,
                  saldo: Number(c.saldo_devedor),
                  dias: diasDivida,
                });
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/clientes/$id"
                        params={{ id: c.id }}
                        className="font-medium hover:underline"
                      >
                        {c.nome}
                      </Link>
                    </TableCell>
                    <TableCell>{c.telefone ?? "-"}</TableCell>
                    <TableCell>{formatBRL(c.limite_fiado)}</TableCell>
                    <TableCell className={disponivel < 0 ? "text-destructive" : ""}>
                      {formatBRL(disponivel)}
                    </TableCell>
                    <TableCell className="font-semibold text-destructive">
                      {formatBRL(c.saldo_devedor)}
                    </TableCell>
                    <TableCell>
                      {diasDivida === 0 ? "Hoje" : `${diasDivida} dia${diasDivida > 1 ? "s" : ""}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {whatsappUrl ? (
                          <Button size="sm" variant="secondary" asChild>
                            <a href={whatsappUrl} target="_blank" rel="noreferrer">
                              <MessageCircle className="h-4 w-4 mr-1" /> Cobrar WhatsApp
                            </a>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled
                            title="Cliente sem telefone"
                          >
                            <MessageCircle className="h-4 w-4 mr-1" /> Sem telefone
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setOpenLimiteCliente(c.id)}
                            >
                              <Pencil className="h-4 w-4 mr-1" /> Alterar limite
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setOpenCliente(c.id)}
                            >
                              <DollarSign className="h-4 w-4 mr-1" /> Registrar pagamento
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {devedores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum cliente devendo. 🎉
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pagamentos.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
          ) : (
            <ul className="divide-y">
              {pagamentos.map((p) => (
                <li key={p.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.clientes?.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(p.data_pagamento)}
                      {p.venda_id && (
                        <>
                          {" "}
                          ·{" "}
                          <Link to="/vendas/$id" params={{ id: p.venda_id }} className="underline">
                            Venda #{p.venda_id.slice(0, 8)}
                          </Link>
                        </>
                      )}
                    </div>
                    {p.observacao && <div className="text-xs mt-0.5">{p.observacao}</div>}
                  </div>
                  <div className="font-medium text-success">{formatBRL(p.valor_pago)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openCliente} onOpenChange={(v) => !v && setOpenCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
          </DialogHeader>
          {cliAtivo && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const v = Number(f.get("valor"));
                if (Number.isNaN(v) || v <= 0) return toast.error("Valor inválido");
                registrar.mutate({
                  cliente_id: cliAtivo.id,
                  valor: v,
                  obs: String(f.get("obs") ?? ""),
                });
              }}
              className="space-y-3"
            >
              <p className="text-sm">
                <span className="text-muted-foreground">Cliente:</span>{" "}
                <span className="font-medium">{cliAtivo.nome}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Deve:</span>{" "}
                <span className="font-semibold text-destructive">
                  {formatBRL(cliAtivo.saldo_devedor)}
                </span>
              </p>
              <div className="space-y-2">
                <Label>Valor pago (R$)</Label>
                <Input
                  name="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(cliAtivo.saldo_devedor)}
                  defaultValue={Number(cliAtivo.saldo_devedor)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Observação (opcional)</Label>
                <Textarea name="obs" rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={registrar.isPending}>
                  Registrar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!openLimiteCliente} onOpenChange={(v) => !v && setOpenLimiteCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar limite de fiado</DialogTitle>
          </DialogHeader>
          {cliLimite && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const limite = Number(f.get("limite"));
                if (Number.isNaN(limite) || limite < 0) return toast.error("Limite inválido");
                alterarLimite.mutate({ cliente_id: cliLimite.id, limite });
              }}
              className="space-y-3"
            >
              <p className="text-sm">
                <span className="text-muted-foreground">Cliente:</span>{" "}
                <span className="font-medium">{cliLimite.nome}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Você pode aumentar ou diminuir o limite. O saldo devedor atual é{" "}
                {formatBRL(cliLimite.saldo_devedor)}.
              </p>
              <div className="space-y-2">
                <Label>Novo limite (R$)</Label>
                <Input
                  name="limite"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={Number(cliLimite.limite_fiado)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={alterarLimite.isPending}>
                  Salvar limite
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function normalizeWhatsAppPhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function buildCobrancaWhatsAppUrl({
  nome,
  telefone,
  saldo,
  dias,
}: {
  nome: string;
  telefone?: string | null;
  saldo: number;
  dias: number;
}) {
  const numero = normalizeWhatsAppPhone(telefone);
  if (!numero) return "";

  const textoDias = dias <= 0 ? "desde hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`;
  const mensagem = `Senhor(a) ${nome}, você tem uma dívida de ${formatBRL(
    saldo,
  )} ${textoDias}. Por favor, entre em contato para regularizar.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export default FiadoPage;
