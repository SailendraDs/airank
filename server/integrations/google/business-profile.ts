/**
 * Google Business Profile Integration (formerly Google My Business)
 * 
 * Manage business listings, reviews, and insights
 * Docs: https://developers.google.com/my-business/reference/rest
 */

export interface BusinessProfileConfig {
  apiKey: string;
  accountId?: string;
}

export interface BusinessLocation {
  name: string;
  locationName: string;
  primaryPhone: string;
  primaryCategory: {
    displayName: string;
    categoryId: string;
  };
  websiteUri: string;
  regularHours?: any;
  metadata?: {
    mapsUri: string;
    newReviewUri: string;
  };
}

export interface BusinessReview {
  reviewId: string;
  reviewer: {
    profilePhotoUrl: string;
    displayName: string;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

export class BusinessProfileClient {
  private apiKey: string;
  private accountId?: string;
  private baseURL = 'https://mybusinessbusinessinformation.googleapis.com/v1';

  constructor(config: BusinessProfileConfig) {
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
  }

  /**
   * List all business locations
   */
  async listLocations(): Promise<BusinessLocation[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to list locations');
    }

    const response = await fetch(
      `${this.baseURL}/accounts/${this.accountId}/locations?key=${this.apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Business Profile API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.locations || [];
  }

  /**
   * Get a specific location
   */
  async getLocation(locationId: string): Promise<BusinessLocation> {
    const response = await fetch(
      `${this.baseURL}/accounts/${this.accountId}/locations/${locationId}?key=${this.apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get location: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * List reviews for a location
   */
  async listReviews(locationId: string): Promise<BusinessReview[]> {
    const response = await fetch(
      `${this.baseURL}/accounts/${this.accountId}/locations/${locationId}/reviews?key=${this.apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get reviews: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.reviews || [];
  }

  /**
   * Reply to a review
   */
  async replyToReview(locationId: string, reviewId: string, comment: string): Promise<void> {
    const response = await fetch(
      `${this.baseURL}/accounts/${this.accountId}/locations/${locationId}/reviews/${reviewId}/reply?key=${this.apiKey}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to reply to review: ${response.statusText}`);
    }
  }

  /**
   * Get location insights (views, searches, etc.)
   */
  async getLocationInsights(locationId: string, startDate: string, endDate: string): Promise<any> {
    // Note: This requires OAuth2 authentication, not just API key
    // Placeholder for now
    throw new Error('Location insights require OAuth2 authentication. Implement using googleapis package.');
  }
}

