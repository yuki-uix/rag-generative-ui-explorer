/**
 * Small production UI vocabulary bridge for this English technical corpus.
 * It does not translate arbitrary questions or modify the frozen evaluation retriever.
 */
const TECHNICAL_TERMS = [
  ['检索增强生成', 'retrieval augmented generation'],
  ['稀疏检索', 'sparse retrieval'],
  ['稠密检索', 'dense retrieval'],
  ['混合检索', 'hybrid retrieval'],
  ['重排序', 'reranking'],
  ['重排', 'reranking'],
  ['召回率', 'recall'],
  ['向量检索', 'vector retrieval'],
  ['知识卡', 'knowledge cards'],
  ['引用', 'citation'],
  ['证据不足', 'insufficient evidence'],
  ['查询改写', 'query rewriting'],
  ['倒数排名融合', 'reciprocal rank fusion'],
] as const;

export function retrievalQueryFor(question: string): {
  retrievalQuery: string;
  queryExpansion: 'technical-terms-v1' | 'none';
} {
  const terms = [...new Set(TECHNICAL_TERMS.filter(([source]) => question.includes(source)).map(([, term]) => term))];
  return {
    retrievalQuery: terms.length > 0 ? `${question}\n${terms.join(' ')}` : question,
    queryExpansion: terms.length > 0 ? 'technical-terms-v1' : 'none',
  };
}
