import { describe, it, expect } from 'vitest';

import {
  CORE_WORKFLOWS,
  ALL_WORKFLOWS,
  getProfileWorkflows,
  getRetiredWorkflowIds,
  formatRetiredWorkflowNotice,
  getRetiredWorkflowNotices,
} from '../../src/core/profiles.js';

describe('profiles', () => {
  describe('CORE_WORKFLOWS', () => {
    it('should contain the default core workflows', () => {
      expect(CORE_WORKFLOWS).toEqual(['analyze', 'matrix', 'publish', 'archive']);
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
      const customWorkflows = ['explore', 'new', 'apply', 'ff', 'matrix'];
      const result = getProfileWorkflows('custom', customWorkflows);
      expect(result).toEqual(['matrix']);
    });

    it('should filter retired explore from custom profile', () => {
      const result = getProfileWorkflows('custom', ['explore', 'analyze', 'matrix']);
      expect(result).toEqual(['analyze', 'matrix']);
    });

    it('should return empty array for custom profile with no customWorkflows', () => {
      const result = getProfileWorkflows('custom');
      expect(result).toEqual([]);
    });

    it('should return empty array for custom profile with empty customWorkflows', () => {
      const result = getProfileWorkflows('custom', []);
      expect(result).toEqual([]);
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
});
