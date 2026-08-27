# Painel Vuou · Meta Ads

Dashboard estático de performance com **filtro de data livre**, que se atualiza sozinho de hora em hora.

```
index.html   →  lê  →  data.json        (GitHub Pages serve os dois)
                        ▲
                        │ commit automático a cada hora
              .github/workflows/update-data.yml
                        │
              scripts/fetch-meta.mjs  →  Meta Marketing API
```

Mesmo sistema de design e mesma engenharia do [painel Geoplas](https://brenofergon.github.io/painel-geoplas/) e do [painel Ricardo Mello](https://corvoassessoriatm.github.io/painel-ricardo-mello/).

---

## O que está rodando hoje

| Campanha | Objetivo principal no painel | Métricas de apoio |
|---|---|---|
| **C1** · `CRV-C1-TRAFEGO-TESTE1-240-08-26` | **Visitas ao perfil** e custo por visita | seguidores, cliques no link, funil impressões → cliques → visitas → seguidores |

A conta é nova: a campanha começou em **24/08/2026**, então o histórico é curto e os números ainda oscilam bastante.

**Por que visitas ao perfil e não seguidores como métrica principal?** Nos primeiros 4 dias a campanha gerou 137 visitas ao perfil e 2 seguidores. Visitas é o que a Meta está otimizando nesta campanha (`profile_visit_view`) e o que tem volume para significar algo; com 2 seguidores, um "custo por seguidor de R$ 24,79" diria mais sobre o tamanho da amostra do que sobre a campanha. Seguidores aparece como métrica de apoio e no fim do funil. **Quando a base crescer, é só trocar `kpi` e `kpi2` de lugar** no bloco `PLAN` de `scripts/fetch-meta.mjs`.

## Quando entrarem C2 e C3

O `PLAN` no topo de `scripts/fetch-meta.mjs` já tem os blocos de **C2 (visualização de vídeo, meta = quem vê 50%+)** e **C3 (conversas iniciadas)** prontos e comentados. Para ativar: descomentar e pôr o `id` da campanha. Nada mais precisa mudar — o `index.html` é genérico e cria a aba, o funil e o ranking de criativos sozinho, seja com 1 campanha ou com 5.

O painel também aceita campanhas fora do padrão C1/C2/C3: basta acrescentar uma entrada no `PLAN` com o `kpi` que fizer sentido.

## Alcance: por que ele não aparece em intervalo personalizado

Alcance é **gente única**. Quem vê o anúncio em três dias é uma pessoa, não três — então o alcance de um período **não é a soma dos dias**. Somar inflava o número em até 90% na visão "Tudo".

Por isso o painel busca na Meta o alcance real de **cada atalho de período** (último dia, 7, 30, 90 dias, este mês, tudo), por conta e por campanha, e guarda em `data.json` → `reach.windows`. Quando você escolhe um atalho, o número exibido é o oficial da Meta.

Em **intervalo de datas personalizado** o alcance aparece como **—**, porque calcular gente única num intervalo arbitrário exige uma nova consulta à API. Inventar uma estimativa ali seria pior que não mostrar. Todo o resto — investimento, impressões, cliques, resultados e o ranking de criativos — continua funcionando normalmente em qualquer intervalo.

A frequência (impressões ÷ alcance) segue a mesma regra.

## Filtro de período

- **Atalhos:** último dia, 7, 30, 90 dias, este mês, tudo.
- **Data livre:** os dois campos de data aceitam qualquer intervalo dentro do histórico. KPIs, funil, gráfico e ranking de criativos recalculam juntos.

O recorte roda no navegador sobre as linhas diárias por anúncio guardadas em `data.json` — por isso qualquer intervalo funciona sem ida à API.

---

## Ligar a atualização automática (~10 min)

### 1) Token da Meta (System User — não expira)

Já existe um no `.env` do repositório da Corvo (chave `META_TOKEN`), com `ads_read` e `ads_management`. Se precisar gerar outro: **business.facebook.com → Configurações do Negócio → Usuários do sistema**, adicionar a conta **`Vuou - 01`** (ID `1337690884685109`) em *Ativos atribuídos*, e gerar token com os escopos `ads_read` e `read_insights`.

### 2) Guardar como secret

**Settings → Secrets and variables → Actions → New repository secret**

- `META_TOKEN` = _(o token)_
- *(Opcional)* `AD_ACCOUNT_ID` = `1337690884685109` — já é o padrão no script.
- *(Opcional, em **Variables**)* `SINCE` = `2026-08-24` — início do histórico.

Pela linha de comando, de dentro da pasta que tem o `.env`:

```bash
gh secret set META_TOKEN -R BrenoFergon/painel-vuou < <(grep '^META_TOKEN=' .env | cut -d= -f2-)
```

### 3) GitHub Pages

**Settings → Pages → Source: _Deploy from a branch_ → `main` / `/ (root)`.**

### Rodar agora

**Actions → Atualizar dados Meta Ads → Run workflow**, ou:

```bash
gh workflow run "Atualizar dados Meta Ads" -R BrenoFergon/painel-vuou
```

> Sem o secret, o painel continua funcionando com os dados semeados, mas **não se atualiza** — o job falha toda hora.

---

## Dados que já vêm no repositório

Histórico real puxado da Meta e **conferido contra os agregados oficiais**: no recorte 24/08 → 26/08 o investimento bate centavo a centavo (R$ 42,71), assim como impressões, cliques, visitas ao perfil e seguidores.

- **7 linhas** diárias por anúncio · **2 anúncios** · **24/08/2026 → 27/08/2026**
- As **capas dos criativos** já vêm em `thumbs/`, em 160 px (teto sem token). O `data.json` marca `thumbs_lowres: true`; na primeira rodada do Actions o script baixa tudo de novo em 400 px.

## Ajustes rápidos

- **Frequência:** `cron` em `.github/workflows/update-data.yml`.
- **Campanhas monitoradas e KPI de cada uma:** bloco `PLAN` em `scripts/fetch-meta.mjs`.
- **Visual e textos:** `index.html`.

## Rodar local

```bash
npx serve .
```

`file://` não funciona — o navegador bloqueia a leitura do `data.json`.

---

**Corvo Assessoria de Tráfego e Marketing** · conta `1337690884685109`
