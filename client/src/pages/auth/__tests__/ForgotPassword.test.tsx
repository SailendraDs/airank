import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import ForgotPassword from '../ForgotPassword';
import * as queryClient from '@/lib/queryClient';

// Mock dependencies
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/', mockSetLocation],
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

describe('ForgotPassword Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render email input step initially', () => {
    render(<ForgotPassword />);

    expect(screen.getByText('Forgot Password')).toBeInTheDocument();
    expect(screen.getByTestId('input-forgot-email')).toBeInTheDocument();
    expect(screen.getByTestId('button-send-reset')).toBeInTheDocument();
    expect(screen.getByTestId('link-back-signin')).toBeInTheDocument();
  });

  it('should successfully send reset code and move to verify step', async () => {
    vi.mocked(queryClient.apiRequest).mockResolvedValue({
      json: async () => ({ success: true }),
    } as Response);

    render(<ForgotPassword />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-forgot-email');
    const sendButton = screen.getByTestId('button-send-reset');

    await user.type(emailInput, 'test@example.com');
    await user.click(sendButton);

    await waitFor(() => {
      expect(queryClient.apiRequest).toHaveBeenCalledWith('POST', '/api/auth/forgot-password', {
        email: 'test@example.com',
      });
      expect(screen.getByText('Verify & Reset')).toBeInTheDocument();
      expect(screen.getByTestId('input-reset-otp-0')).toBeInTheDocument();
    });
  });

  it('should display error when email is not found', async () => {
    const errorMessage = 'Email not found';
    
    vi.mocked(queryClient.apiRequest).mockRejectedValue(
      new Error(errorMessage)
    );

    render(<ForgotPassword />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-forgot-email');
    const sendButton = screen.getByTestId('button-send-reset');

    await user.type(emailInput, 'nonexistent@example.com');
    await user.click(sendButton);

    await waitFor(() => {
      const errorElement = screen.getByTestId('text-forgot-error');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent(errorMessage);
    });
  });

  it('should validate password requirements and successfully reset password', async () => {
    // First, send reset code
    vi.mocked(queryClient.apiRequest).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    } as Response);

    render(<ForgotPassword />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-forgot-email');
    await user.type(emailInput, 'test@example.com');
    await user.click(screen.getByTestId('button-send-reset'));

    // Wait for verify step
    await waitFor(() => {
      expect(screen.getByText('Verify & Reset')).toBeInTheDocument();
    });

    // Mock successful password reset
    vi.mocked(queryClient.apiRequest).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    } as Response);

    // Fill in OTP
    for (let i = 0; i < 6; i++) {
      const otpInput = screen.getByTestId(`input-reset-otp-${i}`);
      await user.type(otpInput, String(i + 1));
    }

    // Fill in new password
    const newPasswordInput = screen.getByTestId('input-new-password');
    const confirmPasswordInput = screen.getByTestId('input-confirm-password');
    
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');
    
    await user.click(screen.getByTestId('button-reset-password'));

    await waitFor(() => {
      expect(queryClient.apiRequest).toHaveBeenCalledWith('POST', '/api/auth/reset-password', {
        email: 'test@example.com',
        code: '123456',
        newPassword: 'newpassword123',
      });
      expect(screen.getByText('Password Reset')).toBeInTheDocument();
      expect(screen.getByText(/Your password has been reset successfully/i)).toBeInTheDocument();
    });
  });

  it('should show error when passwords do not match', async () => {
    // First, send reset code
    vi.mocked(queryClient.apiRequest).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    } as Response);

    render(<ForgotPassword />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-forgot-email');
    await user.type(emailInput, 'test@example.com');
    await user.click(screen.getByTestId('button-send-reset'));

    // Wait for verify step
    await waitFor(() => {
      expect(screen.getByText('Verify & Reset')).toBeInTheDocument();
    });

    // Fill in OTP
    for (let i = 0; i < 6; i++) {
      const otpInput = screen.getByTestId(`input-reset-otp-${i}`);
      await user.type(otpInput, String(i + 1));
    }

    // Fill in mismatched passwords
    const newPasswordInput = screen.getByTestId('input-new-password');
    const confirmPasswordInput = screen.getByTestId('input-confirm-password');
    
    await user.type(newPasswordInput, 'password123');
    await user.type(confirmPasswordInput, 'differentpassword');
    
    await user.click(screen.getByTestId('button-reset-password'));

    await waitFor(() => {
      const errorElement = screen.getByTestId('text-reset-error');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent('Passwords do not match');
    });
  });
});

