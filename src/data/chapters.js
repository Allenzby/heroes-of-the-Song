// 战役结构：两层架构
//
// 大章节（BIG_CHAPTERS）→ 关卡（CHAPTERS）
//
// 大章节「梁山泊」
//   ├─ 序章   梁山泊演练   水泊、山寨   教学
//   ├─ 第一章 河北田虎     山地、关隘   普通
//   ├─ 第二章 淮西王庆     河流、湖泊   普通
//   ├─ 第三章 江南方腊     丛林、城池   困难（剧情分支）
//   └─ 第四章 大宋朝廷     中原、官军   困难
//
// 大章节「江湖路」「征讨录」「天下局」→ 以后添加

export const ROUTES = {
  amnesty: {
    id: 'amnesty',
    tag: 'A',
    action: '杀方腊',
    name: '招安路线',
    summary: '宋江选择忠于朝廷，斩杀方腊。',
    detail: [
      '宋江选择忠于朝廷，斩杀方腊。',
      '战后朝廷嘉奖，但暗中设计除掉梁山残部。',
      '梁山发现真相后，被迫反宋。',
    ],
  },
  righteous: {
    id: 'righteous',
    tag: 'B',
    action: '联合方腊',
    name: '义军路线',
    summary: '截获朝廷密令，与方腊结盟。',
    detail: [
      '吴用、李逵等人截获朝廷密令，发现朝廷要借方腊之手消耗梁山。',
      '宋江仍念忠义，犹豫不决；玩家在最终战选择是否相信兄弟、释放方腊。',
      '若选择联合，宋江被形势所迫同意，部分忠义派英雄（如关胜、呼延灼）离队，方腊残部及江南义军加入。',
    ],
  },
};

export const CHOICE_AT = 'ch3';

export const BIG_CHAPTERS = [
  { id: 'bc1', name: '梁山泊', desc: '聚义水泊，初露锋芒', mapKey: 'iceMap' },
  { id: 'bc2', name: '江湖路', desc: '敬请期待', locked: true, mapKey: 'mountainPass' },
  { id: 'bc3', name: '征讨录', desc: '敬请期待', locked: true, mapKey: 'huaixiWaters' },
  { id: 'bc4', name: '天下局', desc: '敬请期待', locked: true, mapKey: 'jiangnanJungle' },
];

export const CHAPTERS = [
  {
    id: 'prologue',
    bigChapterId: 'bc1',
    label: '序章',
    enemy: '梁山泊演练',
    scene: '水泊、山寨',
    difficulty: '教学',
    summary: '熟悉布阵与操作的演练。',
    requires: null,
    isTutorial: true,
    map: 'iceMap',
  },
  {
    id: 'ch1',
    bigChapterId: 'bc1',
    label: '第一章',
    enemy: '河北田虎',
    scene: '山地、关隘',
    difficulty: '普通',
    summary: '兵进河北，攻取田虎据守的关隘。',
    requires: 'prologue',
    map: 'mountainPass',
  },
  {
    id: 'ch2',
    bigChapterId: 'bc1',
    label: '第二章',
    enemy: '淮西王庆',
    scene: '河流、湖泊',
    difficulty: '普通',
    summary: '水路南下，与王庆争夺淮西水道。',
    requires: 'ch1',
    map: 'huaixiWaters',
  },
  {
    id: 'ch3',
    bigChapterId: 'bc1',
    label: '第三章',
    enemy: '江南方腊',
    scene: '丛林、城池',
    difficulty: '困难',
    summary: '苦战江南。最终战须做出抉择。',
    requires: 'ch2',
    map: 'jiangnanJungle',
    hasChoice: true,
  },
  {
    id: 'ch4',
    bigChapterId: 'bc1',
    label: '第四章',
    enemy: '大宋朝廷',
    scene: '中原、官军',
    difficulty: '困难',
    summary: '两条路线都走到这里：与朝廷决裂。',
    requires: 'ch3',
    map: 'centralPlains',
    needsRoute: true,
  },
];

export function getChapter(id) {
  return CHAPTERS.find((chapter) => chapter.id === id) || null;
}

export function getRoute(id) {
  return ROUTES[id] || null;
}

export function getBigChapter(id) {
  return BIG_CHAPTERS.find((bc) => bc.id === id) || null;
}

export function getChaptersByBigChapter(bigChapterId) {
  return CHAPTERS.filter((ch) => ch.bigChapterId === bigChapterId);
}
