<div align="center">

# 🛡️ GOD'S GATE DEFENSE

### Plataforma SaaS, portal do cliente, gestão de agentes e monitoramento defensivo

**Node.js · TypeScript · Fastify · SQLite · Solana Pay · Helius**

[![CI](https://github.com/stylesxzz/godsgate-defense/actions/workflows/ci.yml/badge.svg)](https://github.com/stylesxzz/godsgate-defense/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node.js-20%2B-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Solana](https://img.shields.io/badge/Payments-USDT%20on%20Solana-9945FF)](https://solana.com/)
[![License](https://img.shields.io/badge/License-See%20LICENSE-lightgrey)](#licença)

</div>

God's Gate Defense é uma plataforma SaaS para clientes criarem e gerenciarem agentes de proteção em ativos autorizados, com portal do cliente, console administrativo, cobrança mensal em USDT, telemetria e honeypot isolado para proteger o próprio site.

> **Arquitetura oficial:** consulte [ARCHITECTURE.md](ARCHITECTURE.md) para o escopo SaaS, proteção completa híbrida, cobrança mensal, painéis de cliente/ADM, agentes multiplataforma e honeypot exclusivo do site.

> **Estado do produto:** esta versão entrega a fundação operacional (painel, API, cadastro/remoção de agentes, heartbeat, eventos, honeypot e cobrança on-chain). O agente incluído reporta presença e telemetria básica. Ele ainda não é um EDR completo, IPS, firewall, antivírus ou sensor de captura de pacotes.

## Recursos

- **Portal do cliente:** cadastro/login por e-mail, senha armazenada com scrypt, sessão HttpOnly, agentes e relatórios isolados por conta; disponível em `/client.html`.\n- **Console administrativo privado:** login administrativo com hash scrypt, sessão JWT em cookie HttpOnly, rate limit e rotas administrativas protegidas.\n- **Administração SaaS:** listagem de clientes, agentes, pagamentos e trilha de auditoria via endpoints administrativos.
- **Gestão de agentes:** criar, emitir inscrição de uso único, instalar em Linux/Windows, visualizar último heartbeat, status da licença, IP, hostname e remover/revogar um agente.
- **Telemetria:** agentes enviam heartbeats e eventos autenticados por token individual. O token permanente não é exibido na URL de inscrição.
- **Honeypot HTTP:** registra IP de origem, caminho-isca, método, User-Agent e horário em tentativas contra rotas conhecidas como `/.env`, `/.git`, `/wp-admin` e `/phpmyadmin`; responde às rotas-isca reconhecidas com HTTP 403 e uma página escura estática, sem scripts de loop ou execução de payloads.
- **Cobrança mensal:** US$ 50,00 em USDT (SPL) na Solana por agente/mês. QR Solana Pay com referência exclusiva, expiração de 30 minutos e confirmação on-chain via Helius.
- **Implantação flexível:** inscrição por URL em Linux/Windows ou kit de instalação em pendrive. A criação de mídia inicializável é feita localmente com ferramenta apropriada; o site não tenta gravar discos diretamente.
- **Persistência:** SQLite com WAL e volume Docker.

## Visão geral

```text
Agent (Linux / Windows)
   | HTTPS + Bearer token
   v
Fastify API  ---- SQLite
   |                 |
   +---- Admin SOC --+---- Agent inventory / heartbeat / events
   |                 +---- Honeypot events
   +---- Helius RPC  ----- Solana transaction verification
```

### Status do agente

| Status | Regra |
|---|---|
| **ATIVO** | Heartbeat nos últimos 3 minutos e licença válida por mais de 7 dias |
| **OFFLINE** | Licença válida, mas heartbeat ausente por mais de 3 minutos |
| **RENOVAÇÃO** | Licença expirada, ausente ou com vencimento dentro de 7 dias |

Uma cobrança confirmada adiciona um mês-calendário à data atual de vencimento (ou à data atual, caso a licença esteja vencida).

## Requisitos

- Node.js 20 ou superior
- npm
- Linux recomendado para produção ou Docker Engine + Docker Compose
- Chave de API da Helius
- Carteira pública Solana para receber USDT

## Configuração local

```bash
git clone https://github.com/stylesxzz/godsgate-defense.git
cd godsgate-defense
npm install
cp .env.example .env
```

Gere um hash bcrypt para a senha administrativa:

```bash
npm run admin:hash
```

Copie o valor emitido para `ADMIN_PASSWORD_HASH` no arquivo `.env`. Preencha também:

- `ADMIN_EMAIL`: e-mail que será usado no login.
- `SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres (`openssl rand -hex 32`).
- `PUBLIC_BASE_URL`: URL HTTPS pública do servidor, sem barra final.
- `PAYMENT_WALLET`: endereço público da sua carteira Solana. Nunca coloque seed phrase ou chave privada no servidor.
- `HELIUS_API_KEY`: chave privada de API da Helius. Ela deve permanecer somente no backend.
- `DB_PATH`: caminho do arquivo SQLite persistente.

Inicie:

```bash
npm run dev
```

Abra `http://localhost:8080`. O endpoint `/healthz` informa a saúde básica da API.

## Docker

```bash
cp .env.example .env
# Configure as variáveis obrigatórias no .env
docker compose up -d --build
docker compose logs -f godsgate
```

O volume `godsgate-data` mantém o banco SQLite após reinicializações. Em produção, configure HTTPS em um proxy reverso e defina `PUBLIC_BASE_URL` com o domínio real.

## Criar e instalar um agente

1. Entre no console como administrador.
2. Em **Agentes**, clique em **Novo agente** e informe identificação e organização.
3. O painel gera uma URL de inscrição de uso único, válida por uma hora.
4. Linux/Debian/Ubuntu: instale Node.js 20+, execute o comando mostrado no painel como root. Ele instala um serviço systemd.
5. Windows: abra PowerShell como administrador, instale Node.js 20+ e execute o comando exibido. O agente é iniciado por uma tarefa agendada no logon do usuário.
6. O agente envia um heartbeat a cada 60 segundos.

A inscrição troca o código temporário por um token de agente. O código só funciona uma vez. Excluir o agente no painel remove o token registrado e revoga os heartbeats futuros.

### Pendrive bootável

O projeto oferece um construtor de kit USB em `usb/build-ubuntu-usb.sh`. Ele prepara os arquivos de instalação, mas **não é uma imagem ISO** e não formata o dispositivo. Para iniciar por USB, use Ventoy ou ferramenta equivalente com uma ISO oficial do Ubuntu Server, copie o kit para a partição de dados e execute o instalador depois de concluir a instalação do sistema. Consulte [USB deployment](usb/README.md).

Consulte [a arquitetura dos agentes](agent/README.md) para ver quais integrações nativas serão necessárias para PC, Android, servidores, sites e filtragem em redes Ethernet/Wi-Fi.\n\n## Pagamentos: US$ 50 em USDT por agente/mês

O QR usa o formato **Solana Pay transfer request**:

- Recipient: valor de `PAYMENT_WALLET`
- Token mint USDT mainnet: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- Amount: `50.00` USDT
- Reference: chave pública aleatória exclusiva por cobrança
- Expiração: 30 minutos

A API consulta `getSignaturesForAddress` para a referência e `getTransaction` para verificar a transação. A confirmação exige uma transação sem erro, referência correspondente, mint oficial e aumento de pelo menos 50 USDT no saldo de token pertencente à carteira recebedora. A licença só é renovada após essa validação.

**Importante:** Helius fornece o RPC e a leitura de transações; o QR é gerado pela aplicação com base no padrão Solana Pay. A Helius não recebe o pagamento nem guarda fundos. Teste primeiro em ambiente de desenvolvimento e confira a carteira e o mint antes de aceitar pagamentos reais. Transferências na blockchain são irreversíveis.

## Honeypot e privacidade

O honeypot é uma camada de observação passiva de HTTP. As rotas suspeitas são registradas com IP, caminho, método, User-Agent e timestamp. Payloads e senhas não são armazenados. Os eventos são retidos por 30 dias e ficam disponíveis somente no painel autenticado.

Use atrás de HTTPS. Configure `TRUST_PROXY=true` somente quando o serviço estiver atrás de um proxy confiável que sobrescreva os cabeçalhos encaminhados. Restrinja o painel por VPN ou allowlist quando possível e publique um aviso de privacidade adequado à LGPD. O honeypot não identifica uma pessoa com certeza: IP pode representar NAT, VPN, proxy ou infraestrutura compartilhada.

## Endpoints principais

| Método | Endpoint | Acesso |
|---|---|---|
| `POST` | `/api/auth/login` | Público + rate limit |
| `POST` | `/api/auth/logout` | Sessão |
| `GET` | `/api/customer/overview` | Cliente autenticado; somente dados do próprio tenant |\n| `POST` | `/api/customer/register` | Público + rate limit |\n| `POST` | `/api/customer/login` | Público + rate limit |\n| `POST/GET` | `/api/customer/agents` | Cliente autenticado; próprio tenant |\n| `POST` | `/api/customer/agents/:id/renewal` | Cliente autenticado; próprio tenant |\n| `DELETE` | `/api/customer/agents/:id` | Cliente autenticado; próprio tenant |\n| `GET` | `/api/admin/customers` | Admin |\n| `GET` | `/api/admin/overview` | Admin |
| `GET/POST` | `/api/admin/agents` | Admin |
| `POST` | `/api/admin/agents/:id/enrollment` | Admin |
| `POST` | `/api/admin/agents/:id/renewal` | Admin |
| `DELETE` | `/api/admin/agents/:id` | Admin |
| `GET` | `/api/admin/honeypot` | Admin |
| `GET` | `/api/admin/payments` | Admin |
| `GET` | `/api/admin/payments/:id` | Admin; verifica cobrança pendente |
| `GET` | `/api/agent/bootstrap/:code` | Código de inscrição de uso único |
| `POST` | `/api/agent/heartbeat` | Token de agente |
| `POST` | `/api/agent/events` | Token de agente |

## Validação

```bash
npm run typecheck
npm test
npm run build
```

O GitHub Actions executa as mesmas verificações em pushes e pull requests.

## Segurança e limitações

- Nunca faça commit de `.env`, chave Helius, token ou chave privada de carteira.
- Use uma carteira dedicada para recebimentos; não compartilhe seed phrase.
- O agente atual envia heartbeat e eventos básicos; não executa comandos remotos, não instala driver de kernel e não altera firewall.
- A captura do honeypot é HTTP e depende de o tráfego passar por esta aplicação. Para proteger um site externo, instale um reverse proxy/WAF ou encaminhe o tráfego pelo serviço.
- O painel não executa gravação USB a partir do navegador. A gravação de mídia é uma operação local privilegiada.
- Esta versão é uma fundação funcional e deve passar por revisão de segurança, testes em ambiente isolado e hardening antes de produção.

## Licença

Consulte o arquivo [LICENSE](LICENSE). Não anuncie conformidade certificada nem proteção total sem auditoria independente.
