// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import fixture from '../fixtures/image-review.json';
import { ImageExperimentReview } from '../components/review/image-experiment-review.js';
import type { ImageReviewData } from '../lib/image-review-types.js';

const data = fixture as ImageReviewData;
const control = data.datasets.find((dataset) => dataset.id === 'control')!;
const legacy = data.datasets.find((dataset) => dataset.id === 'legacy')!;
afterEach(cleanup);

const chooseLegacy = () =>
  fireEvent.click(screen.getByRole('button', { name: /原始实验与金标审查/ }));
function chooseQuestion(id: string) {
  const question = legacy.questions.find((value) => value.id === id)!;
  const sidebar = screen.getByRole('complementary', { name: '评测题选择' });
  const text = within(sidebar).getByText(question.text);
  fireEvent.click(text.closest('button')!);
}

describe('the image experiment review browser', () => {
  it('resets filters, scope and selection when switching between experiments', () => {
    render(<ImageExperimentReview data={data} />);
    fireEvent.change(screen.getByRole('combobox', { name: '排名范围' }), {
      target: { value: 'within' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '按题型筛选' }), {
      target: { value: 'layout' },
    });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'doc-02' },
    });
    chooseLegacy();

    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('');
    expect(screen.getByDisplayValue('全部题型')).toBeDefined();
    expect(screen.queryByRole('combobox', { name: '排名范围' })).toBeNull();
    expect(
      screen.getByRole('heading', { name: legacy.questions[0]!.text }),
    ).toBeDefined();
    expect(screen.getByText('固定题库 · 52 / 52')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /等文字控制实验/ }));
    expect(screen.getByDisplayValue('全库检索 · 24 张图片')).toBeDefined();
    expect(
      screen.getByRole('heading', {
        name: control.questions.find(
          (question) => question.id === 'doc-02-diamond',
        )!.text,
      }),
    ).toBeDefined();
    expect(screen.getByText('固定题库 · 54 / 54')).toBeDefined();
  });

  it('shows incomplete semantic gold as an audited historical label rather than a unique correct answer', () => {
    render(<ImageExperimentReview data={data} />);
    chooseLegacy();
    fireEvent.change(screen.getByRole('combobox', { name: '按题型筛选' }), {
      target: { value: 'concept' },
    });
    chooseQuestion('figure-03-a-concept');

    expect(screen.getByText('不用于主比较')).toBeDefined();
    expect(
      screen.getByText(/single-positive original label is incomplete/),
    ).toBeDefined();
    expect(
      screen.getByText(/已知相关备选：figure-03-a、figure-03-b/),
    ).toBeDefined();
    const goldImages = screen.getAllByRole('img', { name: /^记录金标/ });
    expect(goldImages).toHaveLength(1);
    expect(goldImages[0]!.getAttribute('alt')).toContain('figure-03-a');
    expect(screen.getByText(/12 道概念题的相关性未穷尽审定/)).toBeDefined();
  });

  it('distinguishes CLIP global topic confusion from correct selection within the known topic', () => {
    render(<ImageExperimentReview data={data} />);
    let clip = screen.getByRole('article', { name: 'CLIP 检索' });
    expect(
      within(clip)
        .getByRole('link', {
          name: 'CLIP 检索第一名 control-05-4，未命中记录金标，打开原图',
        })
        .getAttribute('href'),
    ).toBe('/experiments/images/control/control-05-4.png');
    expect(within(clip).getByText('未命中记录金标')).toBeDefined();
    expect(
      within(clip).getByText('查看完整排名（24）与原始分数'),
    ).toBeDefined();

    fireEvent.change(screen.getByRole('combobox', { name: '排名范围' }), {
      target: { value: 'within' },
    });
    clip = screen.getByRole('article', { name: 'CLIP 检索' });
    expect(
      within(clip)
        .getByRole('link', {
          name: 'CLIP 检索第一名 control-01-4，命中记录金标，打开原图',
        })
        .getAttribute('href'),
    ).toBe('/experiments/images/control/control-01-4.png');
    expect(within(clip).getByText('命中记录金标')).toBeDefined();
    expect(within(clip).getByText('查看完整排名（4）与原始分数')).toBeDefined();
    expect(
      screen.getByText('条件选图测试，预先给定正确主题；不是全库召回能力。'),
    ).toBeDefined();
  });

  it('makes an empty filter result recoverable without inventing a retrieval result', () => {
    render(<ImageExperimentReview data={data} />);
    const sidebar = screen.getByRole('complementary', { name: '评测题选择' });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'no-such-frozen-question' },
    });
    expect(
      within(sidebar).getByText('没有匹配题目。请清空搜索或切换题型。'),
    ).toBeDefined();
    expect(within(sidebar).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('固定题库 · 0 / 54')).toBeDefined();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按题型筛选' }), {
      target: { value: 'topic' },
    });
    expect(within(sidebar).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByText('固定题库 · 6 / 54')).toBeDefined();
  });

  it('updates source text, uncorrected OCR and image identity together when selecting evidence', () => {
    render(<ImageExperimentReview data={data} />);
    const summary = screen.getByText('核对来源正文、真实 OCR 与图像身份');
    fireEvent.click(summary);
    const disclosure = summary.closest('details')!;
    for (const id of ['control-01-4', 'control-05-4']) {
      const figure = control.figures.find((value) => value.id === id)!;
      fireEvent.change(
        within(disclosure).getByRole('combobox', { name: '选择证据图' }),
        { target: { value: id } },
      );
      expect(
        Array.from(disclosure.querySelectorAll('pre')).map(
          (node) => node.textContent,
        ),
      ).toEqual([figure.ocrText, figure.sourceText, figure.imageSha256]);
      expect(
        within(disclosure)
          .getByRole('link', { name: '查看来源文件 ↗' })
          .getAttribute('href'),
      ).toContain(figure.sourcePath);
    }
  });
});
