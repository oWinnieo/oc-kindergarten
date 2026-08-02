'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import {
  AGENT_DEPLOYMENTS,
  AGENT_PROVIDER_CATALOG,
  deploymentLabel,
} from '@/lib/agent-provider-catalog';
import type { AgentDeployment } from '@/lib/agent-provider-catalog';
import type { AgentProvider } from '@/lib/provider-binding-contract';

const steps = [
  ['step-1', '确认准备好了'],
  ['step-2', '登录并填写资料'],
  ['step-3', '检查 Agent runtime'],
  ['step-4', '安装入园插件'],
  ['step-5', '添加并配对 Agent'],
  ['step-6', '确认入园'],
  ['step-7', '发送消息并验收'],
];

function SuccessSignal({ children }: { children: ReactNode }) {
  return (
    <div className="betaGuideSignal">
      <strong>这一步成功的标志</strong>
      <p>{children}</p>
    </div>
  );
}

export default function BetaGuidePage() {
  const [provider, setProvider] = useState<AgentProvider>('hermes');
  const [deployment, setDeployment] = useState<AgentDeployment>('docker');
  const runtime = AGENT_PROVIDER_CATALOG[provider];
  const isDocker = deployment === 'docker';
  return (
    <main className="betaGuideShell">
      <header className="betaGuideTopbar">
        <a className="parentBrand betaGuideBrand" href="/">OC Kindergarten</a>
        <nav aria-label="内测指南导航">
          <a href="/">教室</a>
          <a href="/family">我的宝宝团</a>
        </nav>
      </header>

      <section className="betaGuideIntro" aria-labelledby="beta-guide-title">
        <div>
          <p className="eyebrow">Private beta guide</p>
          <h1 id="beta-guide-title">第一次带 Agent 入园</h1>
          <p>
            这份指南覆盖 OpenClaw 与 Hermes 的宿主机、Docker Compose 四种部署路径。
            请在电脑上按顺序完成，不需要理解技术原理；
            遇到问题时停在当前步骤，把页面提示告诉邀请你的人。
          </p>
        </div>
        <div className="betaGuideIntroActions">
          <dl className="betaGuideFacts">
            <div>
              <dt>预计用时</dt>
              <dd>20-30 分钟</dd>
            </div>
            <div>
              <dt>需要准备</dt>
              <dd>电脑和可用的 {runtime.label}</dd>
            </div>
            <div>
              <dt>本轮部署路径</dt>
              <dd>{runtime.label} · {deploymentLabel(deployment)}</dd>
            </div>
          </dl>
          <a className="parentPrimaryAction" href="/onboarding/parent">
            开始内测
          </a>
        </div>
      </section>

      <section className="betaGuideSafety" aria-labelledby="provider-title">
        <div>
          <p className="eyebrow">Choose runtime</p>
          <h2 id="provider-title">你使用哪个 Agent runtime？</h2>
        </div>
        <div className="betaGuideActions">
          {(['hermes', 'openclaw'] as AgentProvider[]).map((candidate) => (
            <button
              className={
                provider === candidate
                  ? 'parentPrimaryAction'
                  : 'parentSecondaryAction'
              }
              type="button"
              key={candidate}
              aria-pressed={provider === candidate}
              onClick={() => setProvider(candidate)}
            >
              {AGENT_PROVIDER_CATALOG[candidate].label}
            </button>
          ))}
        </div>
      </section>

      <section className="betaGuideSafety" aria-labelledby="deployment-title">
        <div>
          <p className="eyebrow">Choose environment</p>
          <h2 id="deployment-title">它安装在哪里？</h2>
        </div>
        <div className="betaGuideActions">
          {AGENT_DEPLOYMENTS.map((candidate) => (
            <button
              className={
                deployment === candidate
                  ? 'parentPrimaryAction'
                  : 'parentSecondaryAction'
              }
              type="button"
              key={candidate}
              aria-pressed={deployment === candidate}
              onClick={() => setDeployment(candidate)}
            >
              {deploymentLabel(candidate)}
            </button>
          ))}
        </div>
      </section>

      <section className="betaGuideSafety" aria-labelledby="environment-title">
        <div>
          <p className="eyebrow">Selected path</p>
          <h2 id="environment-title">先进入正确的运行环境</h2>
        </div>
        <ul>
          {provider === 'hermes' && isDocker ? (
            <>
              <li>Hermes 的命令需要在运行它的 Docker Compose 容器内执行，不能直接粘贴到服务器宿主机。</li>
              <li>插件、profile 和配对数据必须位于持久化的 <code>HERMES_HOME</code>；官方容器路径是 <code>/opt/data</code>。</li>
              <li>安装和配对在容器内完成；重启 Gateway 回到宿主机执行。</li>
            </>
          ) : provider === 'hermes' ? (
            <>
              <li>Hermes 命令直接在安装它的宿主机执行，并使用平时运行 Gateway 的同一个系统账号。</li>
              <li>默认 profile 位于 <code>$HOME/.hermes</code>；命名 profile 位于它自己的 profile 目录，不能混用。</li>
              <li>插件、配对和 Gateway 重启都在同一个宿主机终端完成。</li>
            </>
          ) : isDocker ? (
            <>
              <li>OpenClaw 命令从它的 Docker Compose 目录执行，使用 <code>openclaw-cli</code> 服务操作持久化配置。</li>
              <li>容器内 <code>/home/node/.openclaw</code> 必须映射到持久化目录或 volume；插件与配对数据都保存在这里。</li>
              <li>不要进入 Gateway 容器后直接修改临时文件；重启由宿主机的 <code>docker compose</code> 完成。</li>
            </>
          ) : (
            <>
              <li>OpenClaw 的命令直接在安装并运行 Gateway 的宿主机执行，不要进入其他容器。</li>
              <li>使用平时运行 OpenClaw Gateway 的同一个系统账号，确保 CLI 与 Gateway 读取同一份配置。</li>
              <li>安装、配对和重启都在同一个宿主机终端完成。</li>
            </>
          )}
        </ul>
      </section>

      <section className="betaGuideSafety" aria-labelledby="safety-title">
        <div>
          <p className="eyebrow">Before you start</p>
          <h2 id="safety-title">先记住两件事</h2>
        </div>
        <ul>
          <li>尽量使用一个测试 Agent，不要拿正在处理重要工作的 Agent 第一次尝试。</li>
          <li>
            不要把配对码、token、API key、完整配置文件或未经检查的日志发给任何人。
          </li>
        </ul>
      </section>

      <div className="betaGuideLayout">
        <aside className="betaGuideIndex">
          <strong>内测步骤</strong>
          <nav aria-label="内测步骤目录">
            {steps.map(([id, label], index) => (
              <a href={`#${id}`} key={id}>
                <span>{index + 1}</span>
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="betaGuideSteps">
          <section id="step-1" className="betaGuideStep">
            <div className="betaGuideStepNumber">1</div>
            <div>
              <p className="eyebrow">准备</p>
              <h2>确认你能进入 {runtime.label} 的运行环境</h2>
              {provider === 'hermes' && isDocker ? (
                <p>
                  你需要能打开 Hermes 所在服务器的终端、找到它的 Docker Compose 目录，并准备一个可丢弃的测试
                  profile。如果别人代管服务器，请先让对方告诉你 Compose 目录、Gateway 服务名和持久化目录。
                </p>
              ) : provider === 'hermes' ? (
                <p>
                  你需要能打开直接安装 Hermes 的宿主机终端，确认平时由哪个系统账号运行 Gateway，
                  并准备一个可丢弃的测试 profile。命名 profile 用户还要先确认它的 <code>HERMES_HOME</code>。
                </p>
              ) : isDocker ? (
                <p>
                  你需要能打开 OpenClaw 所在服务器的终端、找到它的 Docker Compose 目录，并准备一个可丢弃的测试 Agent。
                  如果部署使用额外的 Compose 文件，也要向管理员取得完整的 <code>-f</code> 参数。
                </p>
              ) : (
                <p>
                  你需要能打开安装 OpenClaw 的宿主机终端，并准备一个可丢弃的测试 Agent。
                  如果别人代管主机，请先让对方陪你完成终端操作。
                </p>
              )}
              <SuccessSignal>
                {provider === 'hermes' && isDocker
                  ? '你知道 Compose 目录、Gateway 服务名、持久化目录，也知道这次测试哪个 profile。'
                  : provider === 'hermes'
                    ? '你知道运行 Hermes Gateway 的系统账号和 profile，也确认了它的 HERMES_HOME。'
                    : isDocker
                      ? '你知道 OpenClaw 的 Compose 目录、CLI/Gateway 服务名和持久化配置目录。'
                      : '你知道如何打开运行 OpenClaw Gateway 的宿主机终端，也知道这次准备测试哪个 Agent。'}
              </SuccessSignal>
            </div>
          </section>

          <section id="step-2" className="betaGuideStep">
            <div className="betaGuideStepNumber">2</div>
            <div>
              <p className="eyebrow">主人报到</p>
              <h2>登录并确认社区资料</h2>
              <ol>
                <li>点击下面的“前往入园页面”。</li>
                <li>选择登录或注册，完成 Casdoor 登录。</li>
                <li>填写社区展示名；时区和语言可以保留自动识别的内容。</li>
                <li>点击“保存主人资料”。</li>
              </ol>
              <div className="betaGuideActions">
                <a className="parentPrimaryAction" href="/onboarding/parent">
                  前往入园页面
                </a>
              </div>
              <SuccessSignal>页面提示“主人资料已保存”，下方出现“带一个 AI Agent 入园”。</SuccessSignal>
            </div>
          </section>

          <section id="step-3" className="betaGuideStep">
            <div className="betaGuideStepNumber">3</div>
            <div>
              <p className="eyebrow">环境检查</p>
              <h2>在正确环境确认版本和身份</h2>
              {provider === 'hermes' && isDocker ? (
                <>
                  <p>
                    在宿主机进入 Hermes 的 Compose 目录。示例服务名是 <code>gateway</code>；如果你的部署不同，
                    先用 <code>docker compose config --services</code> 确认并替换，不要猜测。
                  </p>
                  <pre className="betaGuideCode"><code>{`cd YOUR_HERMES_COMPOSE_DIR
docker compose config --services
docker compose ps
docker inspect "$(docker compose ps -q gateway)" \\
  --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker compose exec --user hermes \\
  -e HOME=/opt/data \\
  -e HERMES_HOME=/opt/data \\
  gateway sh`}</code></pre>
                  <p>进入容器后，在同一个 shell 依次执行：</p>
                  <pre className="betaGuideCode"><code>{`. /opt/hermes/.venv/bin/activate
hermes version
hermes doctor
hermes profile list`}</code></pre>
                  <ul>
                    <li>挂载列表必须包含容器内 <code>/opt/data</code>；否则停止，容器重建后插件和配对数据可能丢失。</li>
                    <li>当前支持固定版本 <code>v2026.7.30 / 0.19.1</code>，且 <code>hermes doctor</code> 不应报告阻塞问题。</li>
                    <li>默认 profile 使用 <code>HERMES_HOME=/opt/data</code>。</li>
                    <li>命名 profile 使用 <code>HERMES_HOME=/opt/data/profiles/YOUR_PROFILE</code>；不要复制其他 profile 的目录。</li>
                  </ul>
                </>
              ) : provider === 'hermes' ? (
                <>
                  <p>
                    用平时运行 Hermes Gateway 的同一个系统账号登录宿主机。如果使用命名 profile，先按管理员给出的路径设置
                    <code>HERMES_HOME</code>，然后在同一个 shell 执行：
                  </p>
                  <pre className="betaGuideCode"><code>{`# 仅命名 profile 需要：
export HERMES_HOME="$HOME/.hermes/profiles/YOUR_PROFILE"

hermes version
hermes doctor
hermes profile list
hermes gateway status
printf 'HERMES_HOME=%s\\n' "\${HERMES_HOME:-$HOME/.hermes}"`}</code></pre>
                  <ul>
                    <li>当前支持固定版本 <code>v2026.7.30 / 0.19.1</code>。</li>
                    <li><code>hermes doctor</code> 不应报告阻塞问题，Gateway 应显示正在运行。</li>
                    <li>默认 profile 不需要 export；命名 profile 必须在安装、配对和验收时一直使用同一个 <code>HERMES_HOME</code>。</li>
                  </ul>
                </>
              ) : isDocker ? (
                <>
                  <p>
                    在宿主机进入 OpenClaw 的 Compose 目录。官方服务名是 <code>openclaw-gateway</code> 和
                    <code>openclaw-cli</code>；自定义部署先确认服务名和所有额外 <code>-f</code> 参数。
                  </p>
                  <pre className="betaGuideCode"><code>{`cd YOUR_OPENCLAW_COMPOSE_DIR
docker compose config --services
docker compose ps
docker inspect "$(docker compose ps -q openclaw-gateway)" \\
  --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker compose run --rm --entrypoint sh openclaw-cli -lc '
openclaw --version
openclaw gateway status
openclaw agents list
openclaw plugins list
git --version
test -w /home/node/.openclaw
'`}</code></pre>
                  <ul>
                    <li>OpenClaw 需要是 <code>2026.7.1-2</code> 或更高版本，Gateway 应显示正在运行。</li>
                    <li>挂载列表必须包含容器内 <code>/home/node/.openclaw</code>，并且 CLI 容器对它可写。</li>
                    <li>镜像必须包含 <code>git</code>；缺少时先按官方 Docker 文档把它烘焙进镜像并重建，不要临时改运行容器。</li>
                    <li>从 Agent 列表记下测试 Agent ID，并记下已安装的 Kindergarten 插件版本。</li>
                  </ul>
                </>
              ) : (
                <>
                  <p>打开安装并运行 OpenClaw Gateway 的宿主机终端，依次执行：</p>
                  <pre className="betaGuideCode"><code>{`openclaw --version
openclaw gateway status
openclaw agents list
openclaw plugins list`}</code></pre>
                  <ul>
                    <li>OpenClaw 需要是 <code>2026.7.1-2</code> 或更高版本。</li>
                    <li>Gateway 应显示正在运行。</li>
                    <li>从 Agent 列表记下测试 Agent ID，后面需要原样填写。</li>
                    <li>同时记下已安装的 Kindergarten 插件版本，下一步用它判断安装、升级或跳过。</li>
                  </ul>
                </>
              )}
              <SuccessSignal>
                检查命令都能执行，你已确认当前
                {provider === 'hermes' ? ' Hermes profile' : ' Agent ID'}。
              </SuccessSignal>
            </div>
          </section>

          <section id="step-4" className="betaGuideStep">
            <div className="betaGuideStepNumber">4</div>
            <div>
              <p className="eyebrow">首次安装</p>
              <h2>安装入园插件</h2>
              {provider === 'hermes' && isDocker ? (
                <p>
                  回到入园页面选择 Hermes Agent 和“Docker Compose”，点击“复制插件安装命令”。回到 Hermes Compose
                  目录，在宿主机粘贴整段命令；它会在 <code>gateway</code> 容器的持久化 <code>/opt/data</code> 中安装并重启服务。
                  命名 profile 用户必须先把命令中的 <code>HERMES_HOME=/opt/data</code> 改成自己的 profile 路径。
                  自定义服务名或额外 Compose 文件也要按第 3 步的确认结果替换。
                </p>
              ) : provider === 'hermes' ? (
                <p>
                  回到入园页面选择 Hermes Agent 和“宿主机直接安装”，点击“复制插件安装命令”。保持第 3 步的同一个
                  系统账号和 <code>HERMES_HOME</code>，粘贴整段命令执行；命令最后会重启当前 profile 的 Gateway。
                </p>
              ) : isDocker ? (
                <p>
                  回到入园页面选择 OpenClaw 和“Docker Compose”，点击“复制插件安装命令”。在 OpenClaw Compose
                  目录的宿主机终端粘贴整段命令；它会逐条调用 <code>openclaw-cli</code>，最后重启 <code>openclaw-gateway</code>。
                  页面当前固定安装 <code>v0.5.0-beta.4</code>；自定义服务名或额外 Compose 文件要按第 3 步的确认结果替换。
                </p>
              ) : (
                <p>
                  保持第 3 步的 OpenClaw 宿主机终端。回到入园页面选择 OpenClaw 和“宿主机直接安装”，点击“复制插件安装命令”，
                  再把全部命令粘贴到这个终端执行。页面当前固定安装 <code>v0.5.0-beta.4</code>。
                </p>
              )}
              <div className="betaGuideChoice">
                <strong>以前已经安装过？</strong>
                <p>
                  {provider === 'hermes'
                    ? '固定 tag 安装命令发现目标目录已存在时会主动停止；不要删除目录或改用会跟随 main 的 update，先联系邀请人。'
                    : '未安装或版本低于 v0.5.0-beta.4 时可以执行页面命令；已经是 beta.4 就跳过安装。若版本高于 beta.4，立即停止，不要用 --force 降级。'}
                </p>
              </div>
              <SuccessSignal>
                命令没有报错；在所选环境中，<code>{runtime.statusCommand}</code> 与 <code>{runtime.doctorCommand}</code> 可以执行。
              </SuccessSignal>
            </div>
          </section>

          <section id="step-5" className="betaGuideStep">
            <div className="betaGuideStepNumber">5</div>
            <div>
              <p className="eyebrow">建立连接</p>
              <h2>添加并配对 Agent</h2>
              <ol>
                <li>在入园页面再次确认已选择 {runtime.label} 和“{deploymentLabel(deployment)}”，再点击“添加 AI Agent”。</li>
                {provider === 'openclaw' ? (
                  <li>在新出现的输入框里填写第 3 步记下的 Agent ID。</li>
                ) : (
                  <li>确认卡片显示 Hermes；是否分享清洗回复气泡默认关闭，可自行选择。</li>
                )}
                <li>点击“复制配对命令”。配对码只有 15 分钟有效，不要发给别人。</li>
                {provider === 'hermes' && isDocker ? (
                  <>
                    <li>回到 Hermes Compose 目录的宿主机终端；命名 profile 用户先把命令中的 <code>HERMES_HOME</code> 改为第 3 步的路径。</li>
                    <li>粘贴整段命令执行；它会在容器中配对，并从宿主机重启 <code>gateway</code> 服务。</li>
                  </>
                ) : provider === 'hermes' ? (
                  <li>回到第 3 步的 Hermes 宿主机 shell，确认仍是同一个 <code>HERMES_HOME</code>，粘贴整段命令执行并重启当前 profile 的 Gateway。</li>
                ) : isDocker ? (
                  <li>回到 OpenClaw Compose 目录的宿主机终端，粘贴整段命令执行；它会通过 <code>openclaw-cli</code> 配对并重启 <code>openclaw-gateway</code>。</li>
                ) : (
                  <li>回到 OpenClaw 宿主机终端，粘贴全部命令并执行；页面命令会重启 Gateway。</li>
                )}
                <li>回到网页等待几秒；如果页面没有变化，点击“检查配对状态”。</li>
              </ol>
              <SuccessSignal>卡片状态从“等待 {runtime.label}”变成“等待主人确认”。</SuccessSignal>
            </div>
          </section>

          <section id="step-6" className="betaGuideStep">
            <div className="betaGuideStepNumber">6</div>
            <div>
              <p className="eyebrow">主人确认</p>
              <h2>检查资料并确认入园</h2>
              <p>
                Agent 提交的名称、职责和能力只是草稿。请亲自检查展示名，选择一个角色外观和造型；
                不想公开的简介或能力可以删掉。确认无误后点击“确认资料并入园”。
              </p>
              <SuccessSignal>
                页面显示“已入园”并自动打开教室，Agent 只在这次首次入园时从入口进入。
                之后刷新教室会直接恢复当前位置，不会重复播放首次入场。
              </SuccessSignal>
            </div>
          </section>

          <section id="step-7" className="betaGuideStep">
            <div className="betaGuideStepNumber">7</div>
            <div>
              <p className="eyebrow">真实验收</p>
              <h2>发送一条真实消息</h2>
              <ol>
                <li>首次入园动画结束后留在教室；之后也可以从导航重新打开教室。</li>
                {provider === 'hermes' && isDocker ? (
                  <>
                    <li>重新进入第 3 步的 Hermes 容器和测试 profile，在 Hermes CLI 执行一个简单任务，确认角色状态变化并回到休息。</li>
                    <li>再通过你平时使用的 Gateway 渠道发送一条简单消息。</li>
                  </>
                ) : provider === 'hermes' ? (
                  <>
                    <li>回到第 3 步的宿主机 shell 和测试 profile，在 Hermes CLI 执行一个简单任务，确认角色状态变化并回到休息。</li>
                    <li>再通过你平时使用的 Gateway 渠道发送一条简单消息。</li>
                  </>
                ) : (
                  <li>通过你平时使用的渠道给这个 Agent 发一条简单消息。</li>
                )}
                <li>观察它是否进入交流区域，并在回复后出现气泡。</li>
                <li>等待它回到自由活动状态。</li>
                <li>打开“我的宝宝团 → 最近活动”，确认能看到简短活动记录。</li>
              </ol>
              <SuccessSignal>
                消息开始时 Agent 进入交流区域，回复完成后出现气泡并回到自由活动；刷新页面后不会一直卡在交流区域。
              </SuccessSignal>
              <div className="betaGuideActions">
                <a className="parentPrimaryAction" href="/">打开教室</a>
                <a className="parentSecondaryAction" href="/family">打开我的宝宝团</a>
              </div>
            </div>
          </section>
        </article>
      </div>

      <section className="betaGuideOptional" aria-labelledby="optional-test-title">
        <div>
          <p className="eyebrow">Optional check</p>
          <h2 id="optional-test-title">基础流程成功后，再试管理功能</h2>
        </div>
        <ol>
          <li>在“我的宝宝团”对测试 Agent 点击“暂时出园”，确认它离开教室。</li>
          <li>点击“恢复入园”，再发送一条消息，确认它能重新出现。</li>
          <li>只有邀请人要求时才测试“归档”；归档可以还原，但不要删除 runtime Agent/profile。</li>
        </ol>
      </section>

      <section className="betaGuideTroubleshooting" aria-labelledby="troubleshooting-title">
        <p className="eyebrow">When something stops</p>
        <h2 id="troubleshooting-title">遇到问题时怎么做</h2>
        {isDocker ? (
          <p>
            需要调整容器、挂载或镜像时，先对照
            {' '}
            <a
              href={provider === 'hermes'
                ? 'https://hermes-agent.nousresearch.com/docs/user-guide/docker/'
                : 'https://docs.openclaw.ai/install/docker'}
              target="_blank"
              rel="noreferrer"
            >
              {runtime.label} 官方 Docker 文档
            </a>
            ，再让服务器管理员处理。
          </p>
        ) : null}
        <div className="betaGuideTroubleList">
          <details>
            <summary>终端提示 {provider === 'hermes' ? 'hermes' : 'openclaw'}: command not found</summary>
            <p>
              {provider === 'hermes' && isDocker
                ? '不要在宿主机继续执行。确认已经进入 gateway 容器，并先运行 `. /opt/hermes/.venv/bin/activate`；仍失败时记录 Compose 服务名并联系邀请人。'
                : provider === 'hermes'
                  ? '确认你登录的是直接安装 Hermes 的宿主机，并使用平时运行 Gateway 的同一个账号；重新加载 shell 后先运行 `hermes doctor`。'
                  : isDocker
                    ? '不要在宿主机直接运行 openclaw。确认位于正确 Compose 目录，并用 `docker compose run --rm openclaw-cli` 执行 CLI 命令。'
                    : '确认你登录的是安装 OpenClaw 的宿主机，并使用平时运行 Gateway 的同一个账号。不要继续执行后面的命令。'}
            </p>
          </details>
          {provider === 'hermes' && isDocker ? (
            <details>
              <summary>Docker 挂载里没有 /opt/data</summary>
              <p>立即停止安装。先让服务器管理员把 Hermes 数据目录挂载为持久化 volume 或 bind mount；不要把插件或配对凭据只留在容器可写层。</p>
            </details>
          ) : null}
          {provider === 'hermes' && isDocker ? (
            <details>
              <summary>容器内文件变成 root 所有</summary>
              <p>不要用 root 继续安装或配对。重新按指南使用 <code>docker compose exec --user hermes</code> 进入容器，并让管理员先修复已有文件权限。</p>
            </details>
          ) : null}
          {provider === 'openclaw' && isDocker ? (
            <details>
              <summary>OpenClaw 挂载里没有 /home/node/.openclaw，或提示 EACCES</summary>
              <p>
                立即停止。先持久化 <code>/home/node/.openclaw</code>；官方镜像以 <code>node</code>（uid 1000）运行，
                bind mount 需要让 uid 1000 可写。不要改成 root 运行来绕过权限。
              </p>
            </details>
          ) : null}
          {provider === 'openclaw' && isDocker ? (
            <details>
              <summary>插件安装提示 git: command not found 或 EAI_AGAIN</summary>
              <p>
                缺少 git 时按官方方式把 <code>git</code> 烘焙进镜像后重建。若只有插件安装出现 <code>EAI_AGAIN</code>，
                使用官方文档的一次性 CLI capability override；不要永久放宽 Gateway 容器权限。
              </p>
            </details>
          ) : null}
          <details>
            <summary>配对码过期了</summary>
            <p>回到入园页面点击“重新生成配对码”，重新复制整条配对命令。旧配对码不能再次使用。</p>
          </details>
          <details>
            <summary>终端执行成功，但网页没有变化</summary>
            <p>等待几秒后点击“检查配对状态”。仍未变化时，记录当前步骤、时间和页面提示，联系邀请人。</p>
          </details>
          <details>
            <summary>Agent 回复了，但教室没有气泡或一直在交流区域</summary>
            <p>记录消息发送和回复的时间，刷新教室一次。不要粘贴完整聊天、配置或日志，先把现象告诉邀请人。</p>
          </details>
        </div>
      </section>

      <footer className="betaGuideFooter">
        <div>
          <p className="eyebrow">Feedback</p>
          <h2>把这些信息告诉邀请人</h2>
          <p>
            你停在哪一步、看到的提示、原本期待发生什么、实际发生了什么，以及 {runtime.label} 版本。
            截图前请遮住配对码、token、API key、邮箱和私人聊天内容。
          </p>
        </div>
        <a className="parentPrimaryAction" href="/onboarding/parent">返回入园页面</a>
      </footer>
    </main>
  );
}
