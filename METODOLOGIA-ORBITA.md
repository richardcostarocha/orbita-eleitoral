# Órbita Eleitoral

Painel exclusivo para a eleição presidencial brasileira, com dados oficiais do TSE, mapa das UFs, histórico persistente, simulador matemático e laboratório de cenários condicionais. A interface usa superfícies escuras, mapa central, cartões compactos e navegação entre Apuração, Simulador e Modelos.

## Executar

Requer Node.js 22.13 ou superior. Instale com `npm run install:ci`, gere o build com `npm run build` e aplique a migração local seguindo a documentação em `docs/operacao.md`. Inicie com `npm run dev`.

Validações: `node --test tests/election.test.mjs tests/projection.test.mjs tests/apura-model.test.mjs` e `npx tsc --noEmit`.

## Organização

- `app/api/results`: contagem nacional, análise e histórico.
- `app/api/states`: votos presidenciais por UF e exterior.
- `app/api/prediction`: coleta da parcial atual por UF/exterior para o modelo Apura Brasil.
- `lib/apura-model.mjs`: implementação própria do Monte Carlo geográfico, 3.000 simulações, faixa de 90%.
- `components/apura-panel.tsx`: modelo principal e cartão de projeção no painel.
- `app/api/model-data`: base conciliada dos dois turnos para os cenários do segundo turno.
- `lib/election.mjs`: normalização e regras matemáticas testadas.
- `lib/projection.mjs`: três métodos de distribuição regional e simulações Monte Carlo condicionais.
- `lib/tse.ts`: descoberta dos turnos, coleta, cache, contingência e persistência.
- `components/dashboard.tsx`: painel responsivo, mapa, simulador e metodologia.
- `components/forecast-panel.tsx` e `components/forecast-panel.css`: laboratório Modelos, controles e comparação de métodos.
- `lib/map.json`: limites de UFs derivados da malha oficial do IBGE.
- `db/schema.ts` e `drizzle/`: cache e parciais em Cloudflare D1.

## Modelo principal: Apura Brasil

A aba Modelos abre na adaptação do Monte Carlo geográfico do projeto público [Apura Brasil 2026](https://github.com/pedrodavidcet-hub/apura-brasil-2026/blob/main/assets/projection.js). Há também um cartão no painel principal. É uma implementação própria das fórmulas descritas no projeto, sem vínculo ou endosso de seus autores.

A projeção usa somente o turno corrente, combina participações locais e nacionais e varia o volume válido e a divisão dos votos pendentes com distribuição Dirichlet. São 3.000 simulações reproduzíveis. O início padrão é 5% das seções, ajustável para 10% ou 20%. Após 60% a projeção encerra. Finais oficiais têm prioridade. A faixa exibida é de 90% dos cenários, sem calibração histórica; a chance é frequência de vitória nessas simulações e pode ser excessivamente confiante por não modelar erro nacional compartilhado.

No 1º turno são preservados todos os candidatos e a vitória exige maioria absoluta; também são informadas as chances de haver segundo turno e de cada candidato disputá-lo. No 2º turno é exibida a frequência de vitória estrita. Dados ausentes, antigos ou sem conciliação das 27 UFs e exterior suspendem probabilidades. Não há extrapolação nacional de contingência. Antes de 5% não é exibida previsão desse modelo; os cenários manuais continuam separados.

## Limites de interpretação

A vantagem irreversível usa o pior caso para os votos restantes e é identificada como análise própria. O estado oficial de eleito exige confirmação explícita no arquivo nacional final; classificação para segundo turno não é tratada como eleição.

Os cenários manuais alternativos da aba Modelos são um explorador experimental, sem calibração histórica. Usa exclusivamente o primeiro turno oficial de 2026 como referência e mantém fixos os votos já apurados no segundo turno. Compara os métodos regional, swing uniforme e ajuste proporcional nas chances relativas (log-odds), com 4.000 simulações por método. Transferência dos votos dos eliminados, taxa relativa de votos válidos, swing nacional e incerteza são hipóteses editáveis. A probabilidade e a faixa de 95% descrevem esses cenários; não são probabilidades de acerto validadas.

Antes dos primeiros votos, a interface identifica explicitamente um cenário de hipóteses. Sem sinal observado e com swing adicional zero, os três métodos coincidem por construção. Cenários exigem conciliação estrita entre o Brasil e as 27 UFs mais o exterior (ZZ), em ambos os turnos. Leituras ausentes, antigas, inconsistentes ou com destinação pendente suspendem o cálculo. A totalização final substitui as probabilidades pelo encaminhamento ao resultado oficial.

As consultas acontecem sob demanda; o placar atualiza a cada 30 segundos enquanto aberto e visível, os estados e a base dos modelos a cada 60 segundos. O laboratório revalida o frescor dos dados a cada 5 segundos. Sem visitas não há coleta agendada. O histórico começa com as parciais efetivamente capturadas, sem reconstrução de versões anteriores. A integração usa os arquivos oficiais do ciclo 2026, descobertos no arquivo de configuração do TSE. Cache, banco, limites de frescor e fórmulas estão documentados em `docs/operacao.md`.

O site está publicado inicialmente como privado. A audiência e eventual domínio próprio são gerenciados no Sites.


