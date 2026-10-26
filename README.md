# Órbita Eleitoral — Vercel

Atualização do Voto Vivo, com interface Órbita Eleitoral, análises regionais e laboratório de modelos. Veja METODOLOGIA-ORBITA.md para os detalhes e limites dos modelos. Versão adaptada para Next.js padrão e Vercel. Requer Node.js 22.13+.

## Executar e verificar

    npm install
    npm test
    npm run test:database
    npm run typecheck
    npm run build
    npm start

## Publicar

    npx vercel login
    npx vercel --prod --project orbita-eleitoral

Selecione sua conta e use o projeto existente `orbita-eleitoral`. A configuração Next.js é detectada automaticamente. A publicação fornece o endereço real do projeto.

## Cache e histórico

A consulta pública ao TSE não requer credenciais. Sem banco, o placar e o mapa funcionam com cache em memória, e o histórico persistente aparece como indisponível. A memória pode ser reiniciada a qualquer momento pela hospedagem.

Para preservar o histórico, configure na Vercel as três variáveis listadas em `.env.example`, usando o banco D1 existente. O token Cloudflare deve ter apenas a permissão D1 necessária nessa conta. Nunca coloque tokens no código nem em variáveis `NEXT_PUBLIC_*`. Faça novo deploy após configurar.

Para um banco D1 novo, aplique `drizzle/0000_first_ghost_rider.sql` uma única vez antes de usá-lo. O deploy não cria nem migra bancos automaticamente.

## Dados

As fontes e as regras eleitorais foram mantidas. A interface informa falhas quando os arquivos oficiais do TSE não estão disponíveis; a publicação não garante a disponibilidade desses arquivos. Não há coletor agendado: as consultas ocorrem enquanto o site recebe visitas.


Site publicado: https://orbita-eleitoral.vercel.app

