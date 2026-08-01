// Quiz/Final Quiz 목데이터. 문제 컨텐츠(진짜 문제 은행)는 다음 작업에서 교체한다.
// answer는 choices의 index.

export const MOCK_QUIZ = {
  id: "quiz-1",
  question: "대기 중 CO₂ 농도가 늘어나면 행성의 에너지 수지는 어떻게 될까?",
  choices: [
    "흡수 에너지(ASR)가 줄어든다",
    "방출 에너지(OLR)가 줄어들어 에너지가 남는 쪽(Surplus)으로 기운다",
    "알베도가 높아져 온도가 내려간다",
    "에너지 수지에는 영향이 없다",
  ],
  answer: 1,
  reward: { id: "item-carbon-filter", name: "탄소 필터" },
};

export const MOCK_FINAL_QUIZ = {
  id: "final-quiz-1",
  question: "행성이 에너지 평형(Stable) 상태라는 것은 무엇을 의미할까?",
  choices: [
    "흡수 에너지(ASR)가 방출 에너지(OLR)보다 훨씬 많다",
    "방출 에너지(OLR)가 흡수 에너지(ASR)보다 훨씬 많다",
    "흡수 에너지와 방출 에너지가 거의 같다(ΔE ≈ 0)",
    "행성 온도가 항상 288K로 고정된다",
  ],
  answer: 2,
  reward: null,
};
