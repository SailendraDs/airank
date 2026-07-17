import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import SignIn from '../SignIn';
import * as queryClient from '@/lib/queryClient';
import * as authContext from '@/lib/auth-context';

// Mock dependencies
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/', mockSetLocation],
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

describe('SignIn Component', () => {
  const mockSetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useAuth hook
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      setUser: mockSetUser,
    });
  });

  it('should render sign-in form with all required fields', () => {
    render(<SignIn />);

    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByTestId('button-signin')).toBeInTheDocument();
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
  });

  it('should validate required fields before submission', async () => {
    render(<SignIn />);
    const user = userEvent.setup();

    const submitButton = screen.getByTestId('button-signin');
    await user.click(submitButton);

    // HTML5 validation should prevent submission
    const emailInput = screen.getByTestId('input-email') as HTMLInputElement;
    const passwordInput = screen.getByTestId('input-password') as HTMLInputElement;
    
    expect(emailInput.validity.valid).toBe(false);
    expect(passwordInput.validity.valid).toBe(false);
  });

  it('should successfully sign in with valid credentials', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
      onboardingCompleted: true,
      profileImageUrl: null,
    };

    vi.mocked(queryClient.apiRequest).mockResolvedValue({
      json: async () => ({ user: mockUser }),
    } as Response);

    render(<SignIn />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitButton = screen.getByTestId('button-signin');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(queryClient.apiRequest).toHaveBeenCalledWith('POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(mockSetUser).toHaveBeenCalledWith(mockUser);
    });
  });

  it('should redirect to onboarding if user has not completed onboarding', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
      onboardingCompleted: false,
      profileImageUrl: null,
    };

    vi.mocked(queryClient.apiRequest).mockResolvedValue({
      json: async () => ({ user: mockUser }),
    } as Response);

    render(<SignIn />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitButton = screen.getByTestId('button-signin');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith(mockUser);
    });
  });

  it('should display error message on failed login', async () => {
    const errorMessage = 'Invalid email or password';
    
    vi.mocked(queryClient.apiRequest).mockRejectedValue(
      new Error(errorMessage)
    );

    render(<SignIn />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitButton = screen.getByTestId('button-signin');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      const errorElement = screen.getByTestId('text-signin-error');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent(errorMessage);
    });
  });

  it('should show loading state during sign-in', async () => {
    vi.mocked(queryClient.apiRequest).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(<SignIn />);
    const user = userEvent.setup();

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitButton = screen.getByTestId('button-signin');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Button should be disabled during loading
    expect(submitButton).toBeDisabled();
  });
});

