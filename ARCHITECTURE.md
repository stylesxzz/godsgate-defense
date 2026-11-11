# GodsGate Defense — Arquitetura oficial

**Versão:** 1.0  
**Data:** 11 de novembro de 2026  
**Repositório:** https://github.com/stylesxzz/godsgate-defense

## 1. Definição do produto

GodsGate Defense é uma plataforma SaaS de cibersegurança. Clientes criam e administram agentes próprios em um painel isolado por conta. Os agentes executam a proteção nos dispositivos e ambientes autorizados; a plataforma central provisiona identidades, distribui políticas assinadas, recebe telemetria e apresenta relatórios.

O produto tem dois planos operacionais:

- **Control plane (nuvem):** contas, autenticação, agentes, licenças, pagamentos, políticas, inventário, alertas e relatórios.
- **Data plane (local):** sensores e mecanismos de prevenção instalados no dispositivo ou no ponto de rede protegido. A proteção essencial continua funcionando quando a nuvem fica indisponível.

## 2. Decisões oficiais confirmadas

| Decisão | Definição |
|---|---|
| Escopo | Proteção completa: rede, arquivos, processos e ameaças locais |
| Preço | US$ 50 por agente, por mês |
| Pagamento | USDT na rede Solana, com validação on-chain via Helius |
| Operação | Híbrida: proteção local independente + painel central na nuvem |
| Honeypot | Exclusivo do site/infraestrutura do GodsGate; não é instalado nos dispositivos dos clientes |
| Cliente | Cria, conecta, consulta, renova e remove seus próprios agentes |
| Administrador | Conta Stylesxz com isenção de cobrança e gestão global |

A conta administrativa não consome licenças pagas. O backend deve aplicar essa isenção por papel/identidade administrativa, nunca por um campo editável enviado pelo navegador.

## 3. Experiência do cliente

Cada conta tem isolamento lógico e autorização por tenant. O cliente pode:

1. Criar um agente e selecionar o tipo de ambiente/dispositivo.
2. Escolher uma URL pública personalizada ou o endpoint local do servidor de gerenciamento.
3. Gerar uma credencial de inscrição de uso único, curta e revogável.
4. Instalar o agente por instalador do sistema ou kit USB.
5. Ver estado online/offline, versão, último contato e integridade do agente.
6. Consultar alertas por severidade, detecções, ações preventivas e relatórios.
7. Renovar a licença por US$ 50 em USDT por mês.
8. Revogar e remover agentes.

A URL não deve conter tokens permanentes. O vínculo é feito por código temporário, seguido de troca por credencial individual armazenada de forma segura. Cada agente só pode acessar os próprios recursos e enviar telemetria autenticada.

## 4. Painel administrativo

O painel ADM é separado do painel do cliente e protegido por autenticação forte, MFA recomendado e trilha de auditoria. Deve apresentar:

- clientes e estado das contas;
- total de agentes, agentes ativos, offline, suspensos e próximos do vencimento;
- pagamentos, referências, transações e reconciliação;
- visitas e métricas agregadas do site;
- eventos do honeypot do próprio GodsGate;
- criação, revogação e manutenção administrativa de agentes;
- relatórios globais e histórico de ações administrativas.

Ações administrativas sensíveis exigem confirmação, motivo e registro imutável de auditoria. Segredos, tokens completos e chaves privadas nunca aparecem nos painéis ou logs.

## 5. Arquitetura dos agentes

O agente é um serviço nativo com módulos por sistema operacional. A interface web não substitui os componentes privilegiados necessários para inspecionar arquivos, processos e tráfego.

### Capacidades-alvo

- **Rede:** firewall local, inventário de conexões, detecção de padrões de ataque, DNS/conexões suspeitas e contenção de tráfego.
- **Arquivos:** monitoramento de alterações, reputação/hash, varredura antimalware e quarentena controlada.
- **Processos:** inventário, comportamento suspeito, persistência, árvore de processos e contenção.
- **Resposta:** bloquear conexão/processo, isolar arquivo, colocar dispositivo em modo de contenção e registrar evidências.
- **Telemetria:** eventos assinados/autenticados, heartbeat, versão, saúde e sincronização posterior.

### Adaptadores por plataforma

- **Windows:** serviço nativo; integração com Windows Filtering Platform e eventos/telemetria do sistema; integração com Microsoft Defender quando disponível. Ações privilegiadas devem ser assinadas, auditáveis e reversíveis.
- **Linux/servidores:** serviço systemd; nftables e mecanismos de auditoria/telemetria adequados à distribuição; suporte opcional a eBPF quando o kernel permitir.
- **Android:** serviço baseado em Android VpnService para filtragem de tráfego compatível com as APIs Android. Não prometer inspeção irrestrita de arquivos/processos ou bloqueio de todo tráfego: Android limita essas capacidades sem privilégios especiais e políticas do fabricante.
- **Sites:** proteção por reverse proxy/WAF integrado ao tráfego do site. Um agente instalado no host sozinho não protege automaticamente aplicações hospedadas em terceiros.
- **Redes Ethernet/Wi-Fi:** proteção de rede inteira requer implantação no gateway/roteador, bridge ou ponto de saída autorizado. Um agente em um endpoint protege aquele endpoint, não todos os dispositivos da LAN por inferência.

### Operação offline

Cada agente mantém políticas assinadas e versionadas, listas locais de bloqueio, fila persistente de eventos e estado mínimo necessário para operar offline. A perda da conexão com a nuvem não desativa firewall nem regras locais. Ao reconectar, o agente valida a identidade do servidor, sincroniza eventos e recebe políticas assinadas. Atualizações e comandos remotos devem ser autenticados, autorizados, assinados e protegidos contra replay.

O sistema deve usar modo de prevenção gradual, com regras em observação antes de bloqueios automáticos de alto impacto. Deve existir allowlist administrativa, rollback e modo de recuperação para evitar bloquear o próprio cliente ou interromper serviços críticos.

## 6. Conexão e provisionamento

Cada agente pode usar:

- **URL personalizada:** domínio HTTPS do cliente ou endpoint configurado para sua organização.
- **URL local:** endereço do servidor local de gerenciamento, acessível na rede do cliente.

O agente valida TLS e a identidade do servidor. URLs locais não devem ser aceitas sem autenticação ou validação de certificado. A inscrição usa código de uso único e expiração curta; credenciais são rotacionáveis e revogáveis.

## 7. Instalador e mídia USB

O painel pode gerar um pacote de instalação assinado e específico para o sistema operacional. O kit USB serve para transportar o instalador e iniciar o provisionamento. Para persistência, o instalador copia o agente para o armazenamento interno, registra o serviço e conclui o vínculo com a conta. Depois da instalação e validação, o pendrive pode ser removido.

O USB não deve executar silenciosamente nem instalar software sem consentimento e privilégios do proprietário. A criação de mídia bootável é uma operação local explícita. Em celulares, o processo é específico da plataforma; não se deve prometer boot por USB ou instalação privilegiada universal em Android.

## 8. Plataforma central e infraestrutura

Arquitetura lógica alvo:

~~~text
Painel Cliente ─┐
                ├── API / Control Plane ── PostgreSQL (Neon)
Painel ADM ─────┘          │
                           ├── Billing / Helius (Solana)
                           ├── Agent Registry / Policies
                           ├── Event Ingestion / Reports
                           └── Audit / Notifications
                                      ▲
                         HTTPS / canal autenticado
                                      │
                  Agentes locais ────┴──── WAF / Gateway
                  Windows · Linux · Android · Servers
~~~

- **Frontend:** Vercel pode hospedar a interface web e rotas leves.
- **Backend:** API Fastify/Node.js em serviço persistente apropriado para ingestão de eventos e conexões de agentes. Não depender de funções serverless efêmeras para tarefas contínuas ou sockets duradouros.
- **Banco:** Neon PostgreSQL como fonte de verdade para tenants, usuários, agentes, licenças, pagamentos, eventos e auditoria.
- **Agentes:** comunicação de saída autenticada por HTTPS e, quando disponível, canal persistente seguro.
- **Observabilidade:** métricas, logs estruturados, alertas, retenção definida e trilha de auditoria.

### Estado do código atual

O repositório contém uma fundação Node.js/TypeScript/Fastify com SQLite, painel administrativo, heartbeat/eventos básicos, honeypot HTTP e fluxo de pagamento Solana/Helius. O agente atual é telemetria básica; ainda não implementa EDR/IPS completo, inspeção antimalware, firewall multiplataforma nem proteção completa de Android. A arquitetura acima é o destino do produto, não uma declaração de que todas essas capacidades já estão implementadas. A integração de produção com Neon e Vercel deve ser validada separadamente.

## 9. Planos e pagamentos

- Preço padrão: **US$ 50 por agente por mês**.
- Ativo somente após confirmação on-chain de pagamento válido.
- Rede: Solana; ativo: USDT SPL com mint oficial configurado.
- Helius é usado para consultar e verificar transações; não recebe nem custodia fundos.
- Cada cobrança tem referência única, valor, carteira recebedora e estado de expiração.
- A verificação valida assinatura, sucesso da transação, mint, referência, destinatário e valor líquido recebido.
- Renovação acrescenta um mês ao vencimento vigente; pagamentos duplicados não podem renovar duas vezes.
- Conta ADM Stylesxz é isenta de cobrança por regra do servidor.

Nunca armazenar seed phrase ou chave privada da wallet no backend. Variáveis secretas ficam no ambiente do servidor e nunca no frontend.

## 10. Honeypot exclusivo do site GodsGate

O honeypot protege a própria superfície web e infraestrutura do GodsGate. Ele não é o mecanismo de proteção dos endpoints dos clientes.

### Componentes

- Rotas-isca controladas, sem dados ou credenciais reais.
- Detecção de varreduras e tentativas de acessar arquivos/rotas sensíveis inexistentes.
- Registro mínimo de IP observado, horário, método, rota, User-Agent e indicadores técnicos necessários.
- Correlação de eventos, limites por origem, alertas e bloqueio temporário com expiração.
- Isolamento das rotas-isca da aplicação, banco de produção, painel e segredos.
- Retenção limitada, controle de acesso e política de privacidade compatível com a LGPD.

### Resposta visual de bloqueio

Quando houver sinal suficientemente forte, o site pode apresentar uma página escura de bloqueio (“black screen”) e encerrar a sessão ou responder com HTTP 403/429. Essa tela é apenas uma resposta visual; o bloqueio real deve ocorrer no proxy/WAF, firewall ou camada de aplicação.

**Não implementar loop infinito, scripts que travem o navegador, consumo deliberado de CPU/memória, downloads maliciosos ou contra-ataques.** Um loop pode prejudicar a própria infraestrutura, usuários legítimos e serviços compartilhados, além de transformar a defesa em negação de serviço. Se for útil atrasar scanners, usar apenas respostas controladas, curtas, limitadas por tempo e recursos, com circuit breaker.

O honeypot não deve executar comandos enviados, abrir arquivos do servidor, armazenar senhas submetidas nem permitir pivot para sistemas internos. Alertas e bloqueios automáticos devem ter limites, allowlists, expiração e opção de revisão administrativa.

## 11. Segurança, privacidade e confiabilidade

- Isolamento por tenant aplicado no backend e, quando possível, também no banco.
- RBAC e MFA para administração.
- TLS em trânsito, criptografia de segredos em repouso e rotação de credenciais.
- Tokens de agente com escopo mínimo, hash/armazenamento seguro e revogação.
- Políticas e atualizações assinadas.
- Logs sem segredos ou payloads sensíveis por padrão.
- Auditoria de ações administrativas e respostas automáticas.
- Backups testados, migrações versionadas e recuperação de desastre.
- Proteções anti-SSRF, CSRF, XSS, SQL injection, abuso de API e rate limiting.
- Testes de falso positivo, carga, isolamento entre clientes e recuperação offline.
- Avisos de privacidade, minimização e retenção de dados compatíveis com a LGPD.

Nenhum produto pode garantir bloqueio de toda ameaça. O GodsGate deve comunicar capacidades comprovadas, limitações por plataforma e estado real do agente, sem alegações absolutas de proteção.

## 12. Etapas de implementação

1. **Fundação SaaS:** multi-tenancy, autenticação de cliente, painel cliente/ADM, PostgreSQL/Neon, licenças e auditoria.
2. **Billing:** cobrança mensal de US$ 50 em USDT/Solana, confirmação Helius idempotente e isenção ADM.
3. **Control plane dos agentes:** inscrição segura, URL personalizada/local, heartbeat, inventário, políticas assinadas e relatórios.
4. **Proteção Linux:** firewall, telemetria de processos/arquivos, detecção e resposta local offline.
5. **Proteção Windows:** serviço nativo, integração de firewall/telemetria e resposta controlada.
6. **Android:** VpnService, estado de proteção e limitações transparentes.
7. **Sites e redes:** reverse proxy/WAF e gateway/bridge para proteção de tráfego de rede.
8. **USB:** mídia de provisionamento assinada e instalação persistente com consentimento.
9. **Honeypot do site:** iscas isoladas, black-screen de bloqueio, rate limiting, alertas e testes contra abuso.
10. **Hardening e lançamento:** auditoria independente, testes de restauração, segurança, desempenho e documentação operacional.

Cada etapa só deve ser marcada como concluída após implementação, testes e evidências reproduzíveis.
