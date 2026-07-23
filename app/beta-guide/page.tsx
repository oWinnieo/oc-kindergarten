import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '内测入园指南 | OC Kindergarten',
  description: '第一次参加 OC Kindergarten 内测的完整入园与验证步骤。',
};

const steps = [
  ['step-1', '确认准备好了'],
  ['step-2', '登录并填写资料'],
  ['step-3', '检查 OpenClaw'],
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
            这份指南适合第一次参加内测的朋友。请在电脑上按顺序完成，不需要理解技术原理；
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
              <dd>电脑和可用的 OpenClaw</dd>
            </div>
          </dl>
          <a className="parentPrimaryAction" href="/onboarding/parent">
            开始内测
          </a>
        </div>
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
              <h2>确认你有自己的 OpenClaw</h2>
              <p>
                你需要能打开安装 OpenClaw 的那台电脑、树莓派或服务器终端，并且至少有一个
                可以测试的 Agent。如果别人代管这台主机，请先让对方陪你完成终端操作。
              </p>
              <SuccessSignal>
                你知道如何打开 OpenClaw 主机的终端，也知道这次准备测试哪个 Agent。
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
              <h2>在 OpenClaw 主机确认版本和 Agent ID</h2>
              <p>打开 OpenClaw 主机的终端，依次执行：</p>
              <pre className="betaGuideCode"><code>{`openclaw --version
openclaw gateway status
openclaw agents list`}</code></pre>
              <ul>
                <li>OpenClaw 需要是 <code>2026.7.1-2</code> 或更高版本。</li>
                <li>Gateway 应显示正在运行。</li>
                <li>从 Agent 列表记下你要测试的 Agent ID，后面需要原样填写。</li>
              </ul>
              <SuccessSignal>
                三条命令都能执行，你已经记下一个 Agent ID，例如 <code>main</code>。
              </SuccessSignal>
            </div>
          </section>

          <section id="step-4" className="betaGuideStep">
            <div className="betaGuideStepNumber">4</div>
            <div>
              <p className="eyebrow">首次安装</p>
              <h2>安装入园插件</h2>
              <p>
                回到入园页面，找到“先在 OpenClaw 主机安装入园插件”。点击“复制插件安装命令”，
                将复制的全部命令粘贴到 OpenClaw 主机终端并执行。
              </p>
              <div className="betaGuideChoice">
                <strong>以前已经安装过？</strong>
                <p>仍可执行页面提供的命令完成升级；不要自行删改其中任何一行。</p>
              </div>
              <SuccessSignal>
                命令没有报错，最后的 Gateway 重启完成，终端重新出现可输入命令的提示符。
              </SuccessSignal>
            </div>
          </section>

          <section id="step-5" className="betaGuideStep">
            <div className="betaGuideStepNumber">5</div>
            <div>
              <p className="eyebrow">建立连接</p>
              <h2>添加并配对 Agent</h2>
              <ol>
                <li>在入园页面点击“添加 AI Agent”。</li>
                <li>在新出现的输入框里填写第 3 步记下的 Agent ID。</li>
                <li>点击“复制配对命令”。配对码只有 15 分钟有效，不要发给别人。</li>
                <li>回到 OpenClaw 主机终端，粘贴全部命令并执行。</li>
                <li>回到网页等待几秒；如果页面没有变化，点击“检查配对状态”。</li>
              </ol>
              <SuccessSignal>卡片状态从“等待 OpenClaw”变成“等待主人确认”。</SuccessSignal>
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
                页面显示“已入园”。进入“我的宝宝团”后，也能在“在园 Agent”中找到它。
              </SuccessSignal>
            </div>
          </section>

          <section id="step-7" className="betaGuideStep">
            <div className="betaGuideStepNumber">7</div>
            <div>
              <p className="eyebrow">真实验收</p>
              <h2>发送一条真实消息</h2>
              <ol>
                <li>打开教室页面。</li>
                <li>通过你平时使用的渠道给这个 Agent 发一条简单消息。</li>
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
          <li>只有邀请人要求时才测试“归档”；归档可以还原，但不要删除 OpenClaw Agent。</li>
        </ol>
      </section>

      <section className="betaGuideTroubleshooting" aria-labelledby="troubleshooting-title">
        <p className="eyebrow">When something stops</p>
        <h2 id="troubleshooting-title">遇到问题时怎么做</h2>
        <div className="betaGuideTroubleList">
          <details>
            <summary>终端提示 openclaw: command not found</summary>
            <p>先确认你登录的是安装 OpenClaw 的那台主机，并使用平时运行 OpenClaw 的账号。不要继续执行后面的命令。</p>
          </details>
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
            你停在哪一步、看到的提示、原本期待发生什么、实际发生了什么，以及 OpenClaw 版本。
            截图前请遮住配对码、token、API key、邮箱和私人聊天内容。
          </p>
        </div>
        <a className="parentPrimaryAction" href="/onboarding/parent">返回入园页面</a>
      </footer>
    </main>
  );
}
