import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  subscriptionsApi,
  CloudSubscription,
  ComplianceSubscription,
  AvailableCloud,
  AvailableCompliance,
  SubscriptionChangeRequest,
} from "@/lib/api-client";

function normalizeArray<T>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as T[];
  if (Array.isArray(res?.data)) {
    return res.data.map((item: any) => {
      if (item && item.attributes) {
        return { id: item.id, ...item.attributes };
      }
      return item;
    }) as T[];
  }
  if (Array.isArray(res?.data?.data)) {
    return res.data.data.map((item: any) => {
      if (item && item.attributes) {
        return { id: item.id, ...item.attributes };
      }
      return item;
    }) as T[];
  }
  if (Array.isArray(res?.results)) return res.results as T[];
  return [];
}

export function useSubscriptions() {
  const queryClient = useQueryClient();

  const cloudsQuery = useQuery({
    queryKey: ["subscriptions", "clouds"],
    queryFn: async () => {
      const res = await subscriptionsApi.getClouds();
      return normalizeArray<CloudSubscription>(res);
    },
    staleTime: 60 * 1000,
  });

  const compliancesQuery = useQuery({
    queryKey: ["subscriptions", "compliances"],
    queryFn: async () => {
      const res = await subscriptionsApi.getCompliances();
      return normalizeArray<ComplianceSubscription>(res);
    },
    staleTime: 60 * 1000,
  });

  const availableCloudsQuery = useQuery({
    queryKey: ["subscriptions", "available-clouds"],
    queryFn: async () => {
      const res = await subscriptionsApi.getAvailableClouds();
      return normalizeArray<AvailableCloud>(res);
    },
    staleTime: 5 * 60 * 1000,
  });

  const availableCompliancesQuery = useQuery({
    queryKey: ["subscriptions", "available-compliances"],
    queryFn: async () => {
      const res = await subscriptionsApi.getAvailableCompliances();
      return normalizeArray<AvailableCompliance>(res);
    },
    staleTime: 5 * 60 * 1000,
  });

  const changeRequestsQuery = useQuery({
    queryKey: ["subscriptions", "change-requests"],
    queryFn: async () => {
      const res = await subscriptionsApi.getChangeRequests();
      return normalizeArray<SubscriptionChangeRequest>(res);
    },
    staleTime: 30 * 1000,
  });

  const saveOnboardingMutation = useMutation({
    mutationFn: async (data: { cloud_providers: string[]; compliance_frameworks: string[] }) => {
      return await subscriptionsApi.saveOnboarding(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
      queryClient.invalidateQueries({ queryKey: ["findings"] });
      queryClient.invalidateQueries({ queryKey: ["overviews"] });
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: {
      request_type: string;
      target_value: string;
      target_display_name?: string;
    }) => {
      return await subscriptionsApi.createChangeRequest(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions", "change-requests"] });
    },
  });

  const reviewRequestMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: "approved" | "rejected";
      notes?: string;
    }) => {
      return await subscriptionsApi.reviewChangeRequest(id, {
        status,
        review_notes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
      queryClient.invalidateQueries({ queryKey: ["findings"] });
      queryClient.invalidateQueries({ queryKey: ["overviews"] });
    },
  });

  const cloudsList = Array.isArray(cloudsQuery.data) ? cloudsQuery.data : [];
  const compliancesList = Array.isArray(compliancesQuery.data) ? compliancesQuery.data : [];

  const subscribedClouds = cloudsList
    .filter((c) => c && c.is_active)
    .map((c) => String(c.provider_type || "").toLowerCase());

  const subscribedCompliances = compliancesList
    .filter((c) => c && c.is_active)
    .map((c) => String(c.framework_id || ""));

  const isCloudSubscribed = (provider: string) => {
    if (!subscribedClouds.length) return true; // If no subscriptions configured yet, treat as open
    const clean = provider.toLowerCase();
    const alias = clean === "oci" ? "oraclecloud" : clean;
    return subscribedClouds.includes(clean) || subscribedClouds.includes(alias);
  };

  const isComplianceSubscribed = (frameworkId: string) => {
    if (!subscribedCompliances.length) return true;
    return subscribedCompliances.includes(frameworkId);
  };

  return {
    // Lists
    subscribedClouds,
    subscribedCompliances,
    cloudSubscriptions: cloudsList,
    complianceSubscriptions: compliancesList,
    availableClouds: Array.isArray(availableCloudsQuery.data) ? availableCloudsQuery.data : [],
    availableCompliances: Array.isArray(availableCompliancesQuery.data) ? availableCompliancesQuery.data : [],
    changeRequests: Array.isArray(changeRequestsQuery.data) ? changeRequestsQuery.data : [],

    // Helpers
    isCloudSubscribed,
    isComplianceSubscribed,

    // Status
    isLoading: cloudsQuery.isLoading || compliancesQuery.isLoading,
    isError: cloudsQuery.isError || compliancesQuery.isError,

    // Actions
    saveOnboarding: saveOnboardingMutation.mutateAsync,
    isOnboardingSaving: saveOnboardingMutation.isPending,
    createChangeRequest: createRequestMutation.mutateAsync,
    isRequestCreating: createRequestMutation.isPending,
    reviewChangeRequest: reviewRequestMutation.mutateAsync,
    isReviewing: reviewRequestMutation.isPending,
  };
}
