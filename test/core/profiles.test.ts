import { describe, it, expect } from 'vitest';

import {
  CORE_WORKFLOWS,
  ALL_WORKFLOWS,
  getProfileWorkflows,
  getRetiredWorkflowIds,
  formatRetiredWorkflowNotice,
  getRetiredWorkflowNotices,
  getRenamedWorkflowIds,
  formatRenamedWorkflowNotice,
  getRenamedWorkflowNotices,
} from '../../src/core/profiles.js';

describe('profiles', () => {
  describe('CORE_WORKFLOWS', () => {
    it('should contain the default core workflows', () => {
      expect(CORE_WORKFLOWS).toEqual(['analyze', 'cases', 'publish', 'archive']);
    });

    it('should be a subset of ALL_WORKFLOWS', () => {
      for (const workflow of CORE_WORKFLOWS) {
        expect(ALL_WORKFLOWS).toContain(workflow);
      }
    });
  });

  describe('ALL_WORKFLOWS', () => {
    it('should contain all QASpec core workflows', () => {
      expect(ALL_WORKFLOWS).toHaveLength(4);
    });

    it('should match CORE_WORKFLOWS', () => {
      expect([...ALL_WORKFLOWS]).toEqual([...CORE_WORKFLOWS]);
    });
  });

  describe('getProfileWorkflows', () => {
    it('should return core workflows for core profile', () => {
      const result = getProfileWorkflows('core');
      expect(result).toEqual(CORE_WORKFLOWS);
    });

    it('should return core workflows for core profile even if customWorkflows provided', () => {
      const result = getProfileWorkflows('core', ['new', 'apply']);
      expect(result).toEqual(CORE_WORKFLOWS);
    });

    it('should return only QASpec workflow ids for custom profile', () => {
      const customWorkflows = ['explore', 'new', 'apply', 'ff', 'cases'];
      const result = getProfileWorkflows('custom', customWorkflows);
      expect(result).toEqual(['cases']);
    });

    it('should filter retired explore from custom profile', () => {
      const result = getProfileWorkflows('custom', ['explore', 'analyze', 'cases']);
      expect(result).toEqual(['analyze', 'cases']);
    });

    it('should return empty array for custom profile with no customWorkflows', () => {
      const result = getProfileWorkflows('custom');
      expect(result).toEqual([]);
    });

    it('should return empty array for custom profile with empty customWorkflows', () => {
      const result = getProfileWorkflows('custom', []);
      expect(result).toEqual([]);
    });

    it('should map legacy matrix id to cases and deduplicate', () => {
      expect(getProfileWorkflows('custom', ['matrix'])).toEqual(['cases']);
      expect(getProfileWorkflows('custom', ['matrix', 'cases'])).toEqual(['cases']);
    });
  });

  describe('retired workflow notices', () => {
    it('detects explore in custom workflows', () => {
      expect(getRetiredWorkflowIds(['explore', 'analyze'])).toEqual(['explore']);
    });

    it('formats retired workflow notice', () => {
      expect(formatRetiredWorkflowNotice('explore')).toContain('/qsx:analyze');
    });

    it('returns notices only for custom profile', () => {
      expect(getRetiredWorkflowNotices('core', ['explore'])).toEqual([]);
      expect(getRetiredWorkflowNotices('custom', ['explore'])).toHaveLength(1);
    });
  });

  describe('renamed workflow notices', () => {
    it('detects matrix in custom workflows', () => {
      expect(getRenamedWorkflowIds(['matrix', 'analyze'])).toEqual(['matrix']);
    });

    it('formats renamed workflow notice', () => {
      expect(formatRenamedWorkflowNotice('matrix')).toContain('/qsx:cases');
    });

    it('returns notices only for custom profile', () => {
      expect(getRenamedWorkflowNotices('core', ['matrix'])).toEqual([]);
      expect(getRenamedWorkflowNotices('custom', ['matrix'])).toHaveLength(1);
    });
  });
});
