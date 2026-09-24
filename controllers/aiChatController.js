/**
 * aiChatController.js
 * 
 * Orchestrator controller for WHYINSURED AI Chat Assistant.
 * Coordinates Gemini requirement extraction, deterministic policy ranking, and response formatting.
 */

import { analyzeRequirementWithGemini } from '../services/geminiService.js';
import { matchPolicies } from '../services/policyMatcher.js';
import { POLICY_CATALOG } from '../data/policyCatalog.js';
import { searchWebsiteKnowledge } from '../services/websiteKnowledgeService.js';

const SAFETY_DISCLAIMER = "These recommendations are based on verified policy information available on WHYINSURED. Please review the policy wording before making a decision.";

/**
 * Handle POST /api/ai/chat
 */
export async function handleAiChat(req, res) {
  try {
    const { message, conversation = [], currentPlan = null } = req.body;

    // Validate user input
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid message string.'
      });
    }

    const cleanMessage = message.trim();

    // =========================================================================
    // 1. WEBSITE CONTENT FIRST (PRIMARY SOURCE OF TRUTH)
    // Search verified WHYINSURED website content before calling Gemini
    // =========================================================================
    const lowerMsg = cleanMessage.toLowerCase();
    const isExplicitShowPlans = 
      lowerMsg.includes('show plan') ||
      lowerMsg.includes('show me plan') ||
      lowerMsg.includes('recommend plan') ||
      lowerMsg.includes('suggest plan') ||
      lowerMsg.includes('best plan for') ||
      lowerMsg.includes('top plan') ||
      lowerMsg.includes('plans dikhao') ||
      lowerMsg.includes('policy dikhao');

    if (!isExplicitShowPlans) {
      const websiteResult = searchWebsiteKnowledge(cleanMessage, conversation, currentPlan);

      if (websiteResult && websiteResult.found) {
        // Complete website content found - return directly without invoking Gemini
        if (!websiteResult.partial) {
          return res.status(200).json({
            success: true,
            reply: websiteResult.reply,
            intent: websiteResult.intent || 'WEBSITE_KNOWLEDGE',
            conversationStage: 'discussing_plan_features',
            requirements: {},
            excludeCompanies: [],
            recommendations: [],
            disclaimer: SAFETY_DISCLAIMER
          });
        }
      }
    }

    // =========================================================================
    // 2. GEMINI / AI FALLBACK
    // Triggered ONLY when website content is not found or explicit recommendation requested
    // =========================================================================
    const aiAnalysis = await analyzeRequirementWithGemini(cleanMessage, conversation, POLICY_CATALOG);

    let recommendations = [];

    // Only match and attach policy recommendation cards when user explicitly requests to see plans
    const intentUpper = (aiAnalysis.intent || '').toUpperCase();
    if (aiAnalysis.showPlans || intentUpper === 'SHOW_RECOMMENDATIONS' || intentUpper === 'RECOMMENDATION_REQUEST') {
      recommendations = matchPolicies(aiAnalysis.requirements || {}, 4, aiAnalysis.excludeCompanies || []);
    }

    // Print / log the final analysis for testing
    console.log('[AI Chat Controller] Final analysis:', JSON.stringify({
      requirements: aiAnalysis.requirements || {},
      excludeCompanies: aiAnalysis.excludeCompanies || [],
      showPlans: Boolean(aiAnalysis.showPlans)
    }, null, 2));

    // 3. Construct structured client-safe response
    return res.status(200).json({
      success: true,
      reply: aiAnalysis.reply,
      intent: aiAnalysis.intent,
      conversationStage: aiAnalysis.conversationStage || (recommendations.length > 0 ? 'showing_recommendations' : 'collecting_requirements'),
      requirements: aiAnalysis.requirements || {},
      excludeCompanies: aiAnalysis.excludeCompanies || [],
      recommendations,
      disclaimer: SAFETY_DISCLAIMER
    });

  } catch (error) {
    console.error('[AI Chat Controller] Error processing chat request:', error.message);
    
    // Return friendly, sanitized fallback error response
    return res.status(500).json({
      success: false,
      reply: "Sorry, I encountered a temporary issue while processing your requirement. Please try asking again!",
      intent: "error",
      conversationStage: "collecting_requirements",
      requirements: {},
      recommendations: [],
      disclaimer: SAFETY_DISCLAIMER
    });
  }
}
