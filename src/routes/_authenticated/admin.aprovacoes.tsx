import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Trash2, XCircle, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/aprovacoes")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AprovacoesPage,
});

function AprovacoesPage() {
  const qc = useQueryClient();

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["solicitacoes-vendedor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_vendedor")
        .select("id, user_id, nome, email, status, criado_em, analisado_em, observacao")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: vendedores = [], isLoading: loadingVendedores } = useQuery({
    queryKey: ["vendedores-ativos-admin"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendedor");
      if (rolesError) throw rolesError;

      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      if (ids.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, nome, email, criado_em")
        .in("id", ids)
        .order("nome", { ascending: true });
      if (profilesError) throw profilesError;

      return (profiles ?? []).map((p) => ({
        user_id: p.id,
        nome: p.nome,
        email: p.email,
        criado_em: p.criado_em,
      }));
    },
  });

  const aprovar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("aprovar_vendedor", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vendedor aprovado");
      qc.invalidateQueries({ queryKey: ["solicitacoes-vendedor"] });
      qc.invalidateQueries({ queryKey: ["vendedores-ativos-admin"] });
      qc.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejeitar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("rejeitar_vendedor", {
        p_user_id: userId,
        p_observacao: "Rejeitado pelo administrador",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação rejeitada");
      qc.invalidateQueries({ queryKey: ["solicitacoes-vendedor"] });
      qc.invalidateQueries({ queryKey: ["vendedores-ativos-admin"] });
      qc.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirVendedor = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("excluir_vendedor", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso do vendedor removido");
      qc.invalidateQueries({ queryKey: ["solicitacoes-vendedor"] });
      qc.invalidateQueries({ queryKey: ["vendedores-ativos-admin"] });
      qc.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendentes = solicitacoes.filter((s) => s.status === "pendente").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCheck className="h-6 w-6" /> Aprovação de vendedores
        </h1>
        <p className="text-sm text-muted-foreground">
          Novas contas de vendedores aparecem aqui para aprovação do administrador.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold mt-1">{pendentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Vendedores ativos</p>
            <p className="text-2xl font-bold mt-1">{vendedores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Total de solicitações</p>
            <p className="text-2xl font-bold mt-1">{solicitacoes.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitações</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Solicitado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && solicitacoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhuma solicitação de vendedor.
                  </TableCell>
                </TableRow>
              )}
              {solicitacoes.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{formatDateTime(s.criado_em)}</TableCell>
                  <TableCell>
                    {s.status === "pendente" && <Badge variant="secondary">Pendente</Badge>}
                    {s.status === "aprovado" && (
                      <Badge className="bg-success text-success-foreground">Aprovado</Badge>
                    )}
                    {s.status === "rejeitado" && <Badge variant="destructive">Rejeitado</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.status === "pendente" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => aprovar.mutate(s.user_id)}
                          disabled={aprovar.isPending || rejeitar.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            confirm(`Rejeitar ${s.nome}?`) && rejeitar.mutate(s.user_id)
                          }
                          disabled={aprovar.isPending || rejeitar.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {s.analisado_em ? formatDateTime(s.analisado_em) : (s.observacao ?? "—")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Vendedores ativos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingVendedores && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Carregando vendedores…
                  </TableCell>
                </TableRow>
              )}
              {!loadingVendedores && vendedores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhum vendedor ativo.
                  </TableCell>
                </TableRow>
              )}
              {vendedores.map((v) => (
                <TableRow key={v.user_id}>
                  <TableCell className="font-medium">{v.nome}</TableCell>
                  <TableCell>{v.email}</TableCell>
                  <TableCell>{formatDateTime(v.criado_em)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (
                          confirm(
                            `Remover o acesso de vendedor de ${v.nome}? As vendas antigas continuam no histórico.`,
                          )
                        ) {
                          excluirVendedor.mutate(v.user_id);
                        }
                      }}
                      disabled={excluirVendedor.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir vendedor
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default AprovacoesPage;
