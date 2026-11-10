# God's Gate Data Plane — arquitetura dos agentes

O **honeypot não faz parte dos agentes**. Ele pertence exclusivamente ao serviço God's Gate e registra tentativas contra o domínio/API do próprio Control Plane. Nenhum agente de cliente instala um honeypot ou expõe armadilhas na máquina do usuário.

O objetivo do Data Plane é proteger apenas equipamentos, contas, redes e sites para os quais o operador tenha autorização explícita.

## Separação de responsabilidades

- **Control Plane (God's Gate):** identidade de cada agente, licenças, inventário, políticas assinadas, telemetria, histórico e painel SOC.
- **Endpoint Agent:** sensor local e executor de políticas aprovadas no PC ou servidor.
- **Mobile Agent:** aplicativo nativo com API de VPN do sistema operacional.
- **Web Agent:** middleware ou reverse proxy/WAF que recebe o tráfego do domínio protegido.
- **Network Adapter:** integração com o stack do sistema para tráfego Ethernet e Wi-Fi. O nome da interface não altera a política; a integração opera no nível suportado pelo SO.

## Matriz de plataforma

| Plataforma | Ponto de integração | Permissões | Situação |
|---|---|---|---|
| Windows PC/Server | Windows Filtering Platform, serviço Windows, APIs de segurança do host | Instalação administrativa e política WFP | Apenas enrolment/heartbeat Node disponível; adapter nativo pendente |
| Linux PC/Server | eBPF (TC/XDP), nftables, audit/fanotify e systemd | Root/capabilities mínimas específicas | Apenas enrolment/heartbeat Node disponível; adapter nativo pendente |
| Android | `VpnService` para inspeção/filtragem do tráfego do próprio dispositivo | Consentimento explícito do usuário; serviço VPN visível | App Android nativo pendente |
| iOS | Network Extension / Content Filter, conforme entitlement aprovado pela Apple | Entitlement e aprovação da plataforma | Não implementado |
| Site/API | Reverse proxy, WAF ou middleware no caminho HTTP(S) | Configuração do servidor/domínio | Não implementado |

O tráfego cabeado ou sem fio deve ser inspecionado no nível de rede apropriado à plataforma. Um processo Node.js comum não pode garantir captura de todos os pacotes nem bloquear conexões arbitrárias sem integração nativa e permissões.

## Pipeline de defesa planejado

1. Coletar metadados mínimos de conexão/processo/arquivo por sensor nativo.
2. Normalizar eventos no protocolo autenticado do agente.
3. Avaliar indicadores e políticas versionadas, verificadas e assinadas.
4. Começar em modo **observe** (alertar sem bloquear) e permitir calibração/allowlist.
5. Aplicar ações explícitas e limitadas: bloquear IP/domínio, isolar fluxo, colocar arquivo em quarentena ou pedir aprovação do operador.
6. Reportar a ação e seu resultado ao Control Plane.

Não executar comandos arbitrários recebidos pela rede. As ações devem ser tipos enumerados, com validade, assinatura, escopo, expiração e confirmação do agente. A proteção contra malware exige fontes confiáveis de inteligência, atualização de assinaturas, análise de arquivo e testes de falsos positivos; não existe promessa realista de bloquear "qualquer ameaça".

## Estado implementado no repositório

O agente atual em `agent/agent.mjs` troca um código de inscrição de uso único por um token, envia heartbeat e eventos básicos. Os instaladores Linux/Windows registram esse processo no sistema. Ele **ainda não** captura tráfego, não possui driver de rede, não examina arquivos, não faz quarentena nem bloqueia IPs. Os módulos nativos acima precisam ser criados e testados separadamente antes de vender a plataforma como EDR/antivírus/IPS.

## Segurança de implantação

- Instalar apenas em ativos que você possui ou tem autorização para administrar.
- Não interceptar tráfego TLS de terceiros sem autorização e base legal.
- Guardar tokens de agente com permissões restritas e permitir revogação imediata.
- Usar atualizações assinadas e rollback seguro.
- Não habilitar bloqueio automático global antes de testes com allowlists e modo observe.
