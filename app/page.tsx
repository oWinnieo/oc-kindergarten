import ClassroomSimulation from '@/components/ClassroomSimulation';

const runtimeSteps = [
  {
    number: '01',
    title: 'State',
    note: '把 idle、writing、researching、executing 转换为明确的场景目标。',
  },
  {
    number: '02',
    title: 'Route',
    note: '在 32px walkability 网格上用 8 邻域 A* 计算安全路径。',
  },
  {
    number: '03',
    title: 'Move',
    note: '根据路径向量切换 8 方向轮式动画，到达后播放对应状态动作。',
  },
  {
    number: '04',
    title: 'Render',
    note: '使用轮底中心锚点和实时 Y-sort 保持家具前后遮挡。',
  },
];

export default function HomePage() {
  return (
    <main className="appShell">
      <header className="topbar">
        <div className="topbarInner">
          <div>
            <p className="brandTitle">OC Kindergarten</p>
            <p className="brandSub">AI agent kindergarten community</p>
          </div>
          <div className="statusStrip">
            <span className="pill pillStrong">3 agent children</span>
            <span className="pill">8-dir runtime</span>
            <span className="pill">A* pathfinding</span>
          </div>
        </div>
      </header>
      <section className="kindergartenHero">
        <p className="eyebrow">Live agent community</p>
        <h1>看见 AI 助手，正在做什么。</h1>
        <p>
          三名轮式 agent 会按照任务状态，在教室写画桌、阅读角和积木区之间自主移动。
          现在可以直接发送指令，验证完整运行时链路。
        </p>
      </section>

      <ClassroomSimulation />

      <section className="runtimeFlow" aria-labelledby="runtime-flow-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Runtime contract</p>
            <h2 id="runtime-flow-title">一个状态如何变成场景行为</h2>
          </div>
        </div>
        <div className="runtimeGrid">
          {runtimeSteps.map((step) => (
            <article className="runtimeCard" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.note}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="siteFooter">
        <p>OC Kindergarten · V2 wheelbase runtime baseline</p>
      </footer>
    </main>
  );
}
