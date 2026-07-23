import { describe, expect, it } from "vitest";
import {
  RIASEC_AREAS,
  classifyFit,
  interestProfilerForm,
  pearsonCorrelation,
  rankOccupationProfiles,
  scoreInterestAnswers,
  validateScoreRequest,
  type OccupationInterestProfile,
  type RiasecScores,
} from "../src/lib/interest-profiler";

const completeAnswers = Array.from({ length: 30 }, (_, offset) => ({
  index: offset + 1,
  value: (offset % 5) + 1,
}));

describe("Mini Interest Profiler", () => {
  it("preserves the approved form structure", () => {
    expect(interestProfilerForm.questions).toHaveLength(30);
    expect(interestProfilerForm.answerOptions.map((option) => option.value)).toEqual([1, 2, 3, 4, 5]);
    expect(interestProfilerForm.license.modified).toBe(false);
  });

  it("scores five items per RIASEC area deterministically", () => {
    const answers = Array.from({ length: 30 }, (_, offset) => ({ index: offset + 1, value: (offset % 6) + 0 < 3 ? 5 : 1 }));
    const score = scoreInterestAnswers(answers);
    expect(score.raw).toEqual({
      realistic: 25,
      investigative: 25,
      artistic: 25,
      social: 5,
      enterprising: 5,
      conventional: 5,
    });
    expect(score.normalized.realistic).toBe(100);
    expect(score.normalized.social).toBe(0);
    expect(score.highPointOrder).toEqual(RIASEC_AREAS);
    expect(score.validForMatching).toBe(true);
  });

  it("rejects flat profiles for matching", () => {
    const score = scoreInterestAnswers(Array.from({ length: 30 }, (_, offset) => ({ index: offset + 1, value: 3 })));
    expect(score.validForMatching).toBe(false);
  });

  it("validates exactly 30 unique answers and rejects unknown fields", () => {
    const valid = validateScoreRequest({
      formId: interestProfilerForm.formId,
      formVersion: interestProfilerForm.formVersion,
      answers: completeAnswers,
    });
    expect(valid.filters.limit).toBe(20);
    expect(() => validateScoreRequest({ ...valid, extra: true })).toThrow(/unknown field/i);
    expect(() =>
      validateScoreRequest({
        formId: interestProfilerForm.formId,
        formVersion: interestProfilerForm.formVersion,
        answers: [...completeAnswers.slice(0, 29), { index: 29, value: 3 }],
      }),
    ).toThrow(/duplicate index/i);
  });
});

describe("correlation matching", () => {
  it("handles perfect positive, negative, and zero-variance vectors", () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6])).toBeCloseTo(1);
    expect(pearsonCorrelation([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1])).toBeCloseTo(-1);
    expect(pearsonCorrelation([3, 3, 3, 3, 3, 3], [1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it("uses the versioned Career Returns fit thresholds", () => {
    expect(classifyFit(0.729)?.fit).toBe("Best");
    expect(classifyFit(0.608)?.fit).toBe("Good");
    expect(classifyFit(0.426)?.fit).toBe("Okay");
    expect(classifyFit(0.425999)).toBeNull();
  });

  it("applies filters after correlation and breaks ties deterministically", () => {
    const scores: RiasecScores = {
      realistic: 25,
      investigative: 20,
      artistic: 15,
      social: 10,
      enterprising: 8,
      conventional: 5,
    };
    const values = { realistic: 7, investigative: 6, artistic: 5, social: 4, enterprising: 3, conventional: 2 };
    const occupations: OccupationInterestProfile[] = [
      profile("20-0000.00", "Zulu", 2, values, false, false),
      profile("10-0000.00", "Alpha", 4, values, true, true),
      profile("30-0000.00", "Missing dimension", 4, { ...values, social: Number.NaN }, true, true),
    ];
    const result = rankOccupationProfiles(scores, occupations, {
      jobZones: [4],
      brightOutlookOnly: true,
      stemOnly: true,
      limit: 20,
    });
    expect(result.map((item) => item.title)).toEqual(["Alpha"]);
  });
});

function profile(
  code: string,
  title: string,
  jobZone: number,
  values: RiasecScores,
  brightOutlook: boolean,
  stem: boolean,
): OccupationInterestProfile {
  return {
    code,
    title,
    description: title,
    jobZone,
    jobFamilyCode: code.slice(0, 2),
    jobFamilyTitle: "Test",
    brightOutlook,
    stem,
    values,
    highPoints: [],
  };
}
