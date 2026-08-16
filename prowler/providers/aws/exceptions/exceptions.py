"""
AWS Provider Exceptions
"""
class AWSAssumeRoleError(Exception):
    pass

class AWSCredentialsError(Exception):
    pass

class AWSAccessKeyIDInvalidError(Exception):
    pass

class AWSArgumentTypeValidationError(Exception):
    pass

class AWSClientError(Exception):
    pass

class AWSIAMRoleARNEmptyResourceError(Exception):
    pass

class AWSIAMRoleARNInvalidAccountIDError(Exception):
    pass

class AWSIAMRoleARNInvalidResourceTypeError(Exception):
    pass

class AWSIAMRoleARNPartitionEmptyError(Exception):
    pass

class AWSIAMRoleARNRegionNotEmtpyError(Exception):
    pass

class AWSIAMRoleARNServiceNotIAMnorSTSError(Exception):
    pass

class AWSInvalidPartitionError(Exception):
    pass

class AWSInvalidProviderIdError(Exception):
    pass

class AWSNoCredentialsError(Exception):
    pass

class AWSProfileNotFoundError(Exception):
    pass

class AWSSecretAccessKeyInvalidError(Exception):
    pass

class AWSSessionTokenExpiredError(Exception):
    pass

class AWSSetUpSessionError(Exception):
    pass

class AWSIAMRoleARNMissingFieldsError(Exception):
    def __init__(self, file=None, message="Missing fields in IAM Role ARN"):
        self.file = file
        self.message = message
        super().__init__(self.message)
